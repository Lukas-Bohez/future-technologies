// Windsensor voor de Energy Twin (ESP32). NIET getest op echte hardware in dit project: gebruik als startpunt.
//
// Twee potmeters simuleren een anemometer (windsnelheid) en een windvaan (windrichting):
//   potmeter 1 (middenpin)  -> GPIO34   windsnelheid 0-25 m/s
//   potmeter 2 (middenpin)  -> GPIO35   windrichting 0-359 graden (waar de wind VANDAAN komt, 0 = noord)
//   buitenste pinnen van beide potmeters naar 3V3 en GND
// De ESP32 stuurt elke 500 ms een regel JSON over USB (115200 baud), die de Energy Twin via Web Serial leest:
//   {"wind": 7.5, "dir": 220}
//
// Een echte anemometer met reed-contact of hall-sensor geeft pulsen: tel ze per seconde en reken om met de
// factor van de fabrikant (bv. 1 puls/s = 2,4 km/h = 0,667 m/s), en vervang dan readWind().

const int PIN_SPEED = 34;
const int PIN_DIR = 35;

float readWind() {
  return analogRead(PIN_SPEED) / 4095.0f * 25.0f; // 12-bit ADC: 0..4095 -> 0..25 m/s
}

int readDirection() {
  return (int)(analogRead(PIN_DIR) / 4095.0f * 359.0f);
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
}

void loop() {
  Serial.printf("{\"wind\": %.1f, \"dir\": %d}\n", readWind(), readDirection());
  delay(500);
}
