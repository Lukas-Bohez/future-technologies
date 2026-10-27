// Uitbreiding: echte hardware (ESP32 of Arduino met een windsensor of potmeter) koppelen via de Web Serial API.
// De microcontroller stuurt regels over USB (115200 baud), bv.
//   {"wind": 7.5, "dir": 220}      (JSON)
//   wind=7.5 dir=220               (sleutel=waarde)
// Een voorbeeldprogramma voor de ESP32 staat in week 2/hardware/. Web Serial werkt in Chrome en Edge, via https of localhost.
// Privacy: de data blijft in de browser, er wordt niets verstuurd.

// Zet één regel van de sensor om naar { wind?, dir? } (of null als hij niets bruikbaars bevat).
export function parseSensorLine(line) {
  const text = line.trim();
  if (!text) return null;
  let wind;
  let dir;
  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text);
      wind = json.wind;
      dir = json.dir;
    } catch {
      return null;
    }
  } else {
    const w = text.match(/wind\s*[=:]\s*(-?\d+(?:\.\d+)?)/i);
    const d = text.match(/dir\s*[=:]\s*(-?\d+(?:\.\d+)?)/i);
    if (w) wind = Number(w[1]);
    if (d) dir = Number(d[1]);
  }
  const out = {};
  if (Number.isFinite(wind)) out.wind = Math.min(30, Math.max(0, wind));
  if (Number.isFinite(dir)) out.dir = ((dir % 360) + 360) % 360;
  return Object.keys(out).length ? out : null;
}

export function createSerialSensor(onData, onStatus) {
  const supported = 'serial' in navigator;
  let port = null;
  let reader = null;
  let running = false;

  async function connect() {
    if (!supported) {
      onStatus('Web Serial wordt niet ondersteund (gebruik Chrome of Edge)');
      return false;
    }
    try {
      port = await navigator.serial.requestPort(); // de gebruiker kiest zelf het apparaat
      await port.open({ baudRate: 115200 });
    } catch (err) {
      onStatus(`Verbinden mislukt: ${err.message}`);
      return false;
    }
    onStatus('Sensor verbonden, wacht op data…');
    running = true;
    readLoop();
    return true;
  }

  async function readLoop() {
    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable).catch(() => {});
    reader = decoder.readable.getReader();
    let buffer = '';
    try {
      while (running) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop(); // het onvolledige laatste stuk bewaren
        for (const line of lines) {
          const data = parseSensorLine(line);
          if (data) onData(data);
        }
      }
    } catch (err) {
      onStatus(`Sensorfout: ${err.message}`);
    }
  }

  async function disconnect() {
    running = false;
    try {
      await reader?.cancel();
      await port?.close();
    } catch {
      /* al gesloten */
    }
    onStatus('Sensor losgekoppeld');
  }

  return { supported, connect, disconnect, get connected() { return running; } };
}

// Gesimuleerde sensor om de koppeling te testen zonder hardware: levert elke 500 ms zijn eigen "gemeten" waarden,
// met ruis zoals een echte anemometer. Duidelijk gelabeld in de interface als simulatie.
export function createSimulatedSensor(onData) {
  let timer = null;
  let t = 0;
  return {
    start() {
      timer = setInterval(() => {
        t += 0.5;
        const wind = 9 + 5 * Math.sin(t / 8) + (Math.random() - 0.5) * 1.5; // golvende wind met ruis
        const dir = 220 + 40 * Math.sin(t / 25);
        onData(parseSensorLine(JSON.stringify({ wind: +wind.toFixed(1), dir: Math.round(dir) })));
      }, 500);
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
    get running() {
      return timer !== null;
    },
  };
}
