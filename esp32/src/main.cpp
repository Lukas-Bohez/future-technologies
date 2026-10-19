// ESP32 -> Bluetooth A2DP bron. Zoekt zelf speakers, verbindt ze één voor één en
// speelt de mp3's uit LittleFS (/track1.mp3, /track2.mp3, ...) zacht af.
//
// Beperking: een ESP32 kan maar met ÉÉN speaker tegelijk verbonden zijn.
// Speakers komen dus na elkaar aan de beurt, niet gelijktijdig.
#include <Arduino.h>
#include <LittleFS.h>
#include <vector>
#include "AudioTools.h"
#include "AudioTools/AudioCodecs/CodecMP3Helix.h"
#include "BluetoothA2DPSource.h"
#include "freertos/stream_buffer.h"
#include "config.h"

using namespace audio_tools;

struct Speaker {
  String name;
  esp_bd_addr_t addr;
  int rssi;
};

static BluetoothA2DPSource a2dp;
static StreamBufferHandle_t pcmBuf;  // stereo 16-bit frames (4 bytes per frame)

static std::vector<Speaker> found;
static std::vector<String> filter = NAME_FILTER;
static volatile bool scanning = false;
static volatile bool haveTarget = false;
static esp_bd_addr_t targetAddr;

static volatile bool trackDone = true;      // decoder is klaar met huidige track
static volatile uint32_t framesPlayed = 0;  // voor fade-in
static float gain = min(VOLUME_PERCENT, MAX_VOLUME_PERCENT) / 100.0f;

// ---- PCM-sink: mono/stereo, 22.05/44.1 kHz -> 44.1 kHz stereo met volume + fade-in ----
class PcmSink : public AudioOutput {
 public:
  size_t write(const uint8_t* data, size_t len) override {
    const int16_t* in = (const int16_t*)data;
    size_t samples = len / 2;
    int ch = max<int>(1, audioInfo().channels);
    int rep = (audioInfo().sample_rate > 0 && audioInfo().sample_rate <= 24000) ? 2 : 1;
    for (size_t i = 0; i + ch <= samples; i += ch) {
      int16_t l = in[i], r = (ch > 1) ? in[i + 1] : in[i];
      float g = gain;
      uint32_t fadeFrames = (uint32_t)FADE_IN_MS * 44100 / 1000;
      if (framesPlayed < fadeFrames) g *= (float)framesPlayed / fadeFrames;
      int16_t out[2] = {(int16_t)(l * g), (int16_t)(r * g)};
      for (int k = 0; k < rep; k++) {
        // blokkeert (backpressure) tot de A2DP-callback ruimte maakt
        while (xStreamBufferSend(pcmBuf, out, sizeof(out), pdMS_TO_TICKS(100)) != sizeof(out)) {
          if (trackDone) return len;  // afgebroken
        }
        framesPlayed++;
      }
    }
    return len;
  }
};

static PcmSink sink;
static MP3DecoderHelix mp3;
static EncodedAudioStream decoder(&sink, &mp3);
static volatile bool abortTrack = false;

static void decodeTask(void* arg) {
  String path = *(String*)arg;
  delete (String*)arg;
  File f = LittleFS.open(path, "r");
  if (!f) {
    Serial.printf("kan %s niet openen\n", path.c_str());
    trackDone = true;
    vTaskDelete(nullptr);
  }
  decoder.begin();
  uint8_t buf[512];
  uint32_t start = millis();
  while (f.available() && !abortTrack) {
    size_t n = f.read(buf, sizeof(buf));
    decoder.write(buf, n);
    if (PLAY_SECONDS_MAX && millis() - start > PLAY_SECONDS_MAX * 1000UL) break;
  }
  f.close();
  decoder.end();
  trackDone = true;
  vTaskDelete(nullptr);
}

// ---- A2DP callbacks ----
static int32_t dataCallback(Frame* frames, int32_t count) {
  size_t got = xStreamBufferReceive(pcmBuf, frames, count * sizeof(Frame), 0) / sizeof(Frame);
  for (int32_t i = got; i < count; i++) frames[i].channel1 = frames[i].channel2 = 0;  // stilte
  return count;
}

static bool matchesFilter(const String& n) {
  if (filter.empty()) return true;
  for (auto& f : filter) if (n.indexOf(f) >= 0) return true;
  return false;
}

static bool discoveryCallback(const char* name, esp_bd_addr_t addr, int rssi) {
  if (scanning) {
    for (auto& s : found) if (!memcmp(s.addr, addr, 6)) return false;
    String n = name ? name : "";
    if (matchesFilter(n)) {
      Speaker s;
      s.name = n;
      memcpy(s.addr, addr, 6);
      s.rssi = rssi;
      found.push_back(s);
      Serial.printf("gevonden: %s (%d dBm)\n", n.c_str(), rssi);
    }
    return false;  // tijdens scannen nooit verbinden
  }
  return haveTarget && !memcmp(addr, targetAddr, 6);
}

static int countTracks() {
  int n = 0;
  while (LittleFS.exists("/track" + String(n + 1) + ".mp3")) n++;
  return n;
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n== ESP32 multi-speaker muziek ==");
  if (!LittleFS.begin(false)) {
    Serial.println("LittleFS mount mislukt. Voer uit: python tools/prepare_audio.py en daarna 'pio run -t uploadfs'");
    while (true) delay(1000);
  }
  pcmBuf = xStreamBufferCreate(16 * 1024, sizeof(Frame));
  decoder.addNotifyAudioChange(sink);

  a2dp.set_ssid_callback(discoveryCallback);
  a2dp.set_data_callback_in_frames(dataCallback);
  a2dp.set_auto_reconnect(false);
  a2dp.set_volume(A2DP_VOLUME);
  a2dp.start();
}

void loop() {
  int tracks = countTracks();
  if (tracks == 0) {
    Serial.println("Geen /trackN.mp3 in flash gevonden (uploadfs vergeten?)");
    delay(5000);
    return;
  }

  // 1) scannen
  found.clear();
  haveTarget = false;
  scanning = true;
  Serial.printf("Scannen (%d s)...\n", SCAN_SECONDS);
  delay(SCAN_SECONDS * 1000UL);
  scanning = false;
  if (found.empty()) {
    Serial.println("Geen speakers gevonden. Zet ze in koppelmodus en niet verbonden met je gsm.");
    return;
  }

  // 2) één voor één verbinden en afspelen (sterkste signaal eerst)
  std::sort(found.begin(), found.end(), [](const Speaker& a, const Speaker& b) { return a.rssi > b.rssi; });
  int idx = 0;
  for (auto& s : found) {
    String path = "/track" + String(idx % tracks + 1) + ".mp3";
    idx++;
    Serial.printf("Verbinden met %s ...\n", s.name.c_str());
    memcpy(targetAddr, s.addr, 6);
    haveTarget = true;
    a2dp.connect_to(targetAddr);

    uint32_t t0 = millis();
    while (!a2dp.is_connected() && millis() - t0 < CONNECT_TIMEOUT_S * 1000UL) delay(100);
    if (!a2dp.is_connected()) {
      Serial.println("  mislukt, volgende.");
      continue;
    }
    Serial.printf("  verbonden, speel %s (volume %d%%)\n", path.c_str(), (int)(gain * 100));
    xStreamBufferReset(pcmBuf);
    framesPlayed = 0;
    trackDone = false;
    abortTrack = false;
    xTaskCreatePinnedToCore(decodeTask, "decode", 12288, new String(path), 1, nullptr, 1);
    while (!trackDone && a2dp.is_connected()) delay(200);
    abortTrack = true;
    trackDone = true;
    delay(500);
    a2dp.disconnect();
    haveTarget = false;
    delay(1500);
  }
}
