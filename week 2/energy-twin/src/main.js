import './style.css';
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { TURBINE, TURBINE_COUNT, WIND_CO2, turbinePowerMW, rotorSpeed, co2SavedTonnes, compassName } from './wind.js';
import { sunPosition, sunDirection, solarFieldMW, effectiveTilt, solarCo2SavedTonnes, dayLabel, formatHour } from './solar.js';
import { GRID, MONEY, demandMW, createGridState, stepGrid, money, simulateDay } from './grid.js';
import { fetchLiveWind } from './data.js';
import { createRecognizer, parseCommand, speak } from './voice.js';
import { createChart, createDayChart } from './chart.js';
import { createWorld } from './world.js';
import { createGame } from './game.js';
import { createTurret } from './turret.js';
import { createRadar } from './radar.js';
import { createSerialSensor, createSimulatedSensor } from './hardware.js';
import { answer } from './assistant.js';

// =====================================================================
// ENERGY TWIN – "Operation Offshore Wind"
// Dit bestand verbindt alles:
//   world.js   de 3D-wereld (zee, windmolens, eilanden, dorp, batterij) in cirkels rond de speler
//   game.js    boten, boeven en vissers, score
//   turret.js  de boom-kanon (richten, schieten, bladeren)
//   wind.js, solar.js, grid.js   de rekenmodellen (wind, zon, net + batterij + geld + scenario's)
//   data.js, hardware.js, voice.js, assistant.js   echte data, sensor, spraak en vragen stellen
// Hieronder: HUD, invoer van de wind (slider, live of sensor) en de render loop.
// =====================================================================

const $ = (selector) => document.querySelector(selector);

// ---------------------------------------------------------------------
// 1. BASIS: wereld, camera, renderer
// ---------------------------------------------------------------------
const world = createWorld();
const { scene } = world;

// Camera = ons oog. Parameters: gezichtsveld (graden), beeldverhouding, dichtste en verste afstand.
// De camera zit vast aan de boom-kanon (zie turret.js): er is geen vrije camerabeweging.
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 400);

// Renderer tekent de scene vanuit de camera op het <canvas>.
const renderer = new THREE.WebGLRenderer({ canvas: $('#scene'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.xr.enabled = true; // WebXR: de scène werkt ook in een VR-headset
const vrButton = VRButton.createButton(renderer);
// De standaardplaats van de knop (onderaan het midden) botst met onze schermknoppen: zet hem onder de scorebalk.
Object.assign(vrButton.style, { bottom: 'auto', top: '56px' });
document.body.appendChild(vrButton);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix(); // moet na elke wijziging aan de camera
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------
// 2. HUD-elementen
// ---------------------------------------------------------------------
const el = {
  card: $('#card'),
  score: $('#score'),
  crosshair: $('#crosshair'),
  wind: $('#wind'),
  windLabel: $('#windLabel'),
  windDir: $('#windDir'),
  windDirLabel: $('#windDirLabel'),
  source: $('#source'),
  power: $('#power'),
  energy: $('#energy'),
  hour: $('#hour'),
  hourLabel: $('#hourLabel'),
  season: $('#season'),
  seasonLabel: $('#seasonLabel'),
  tilt: $('#tilt'),
  tiltLabel: $('#tiltLabel'),
  orient: $('#orient'),
  sunInfo: $('#sunInfo'),
  solarPower: $('#solarPower'),
  solarEnergy: $('#solarEnergy'),
  battery: $('#battery'),
  price: $('#price'),
  priceLabel: $('#priceLabel'),
  gridInfo: $('#gridInfo'),
  moneyInfo: $('#moneyInfo'),
  co2: $('#co2'),
  play: $('#btnPlay'),
  voiceLog: $('#voiceLog'),
  scenTable: $('#scenTable'),
  askLog: $('#askLog'),
  hwStatus: $('#hwStatus'),
};
const windChart = createChart($('#chart'), TURBINE.ratedMW * TURBINE_COUNT, 'MW');
const solarChart = createDayChart($('#dayChart'), 60, 'MW');
const gridChart = createDayChart($('#gridChart'), 100, 'MW');
const scenChart = createDayChart($('#scenChart'), 60, 'MW');
const radar = createRadar($('#radar'), 50);

// ---------------------------------------------------------------------
// 3. SPEL EN KANON
// ---------------------------------------------------------------------
const ui = {
  villain(info) {
    const times = Math.round(info.co2 / WIND_CO2);
    el.card.innerHTML = `<strong>${info.name}</strong><br>${info.co2} g CO₂ per kWh<br>Windenergie: ${WIND_CO2} g → ${times}× minder`;
    el.card.hidden = false;
  },
  warning(text) {
    el.card.textContent = text;
    el.card.hidden = false;
  },
  score() {
    const { score, timeLeft, playing } = game.state;
    el.score.textContent = playing ? `Score: ${score} · ${Math.ceil(timeLeft)} s` : `Score: ${score} · druk op Start`;
  },
  reset() {
    el.card.hidden = true;
  },
};
const game = createGame(world, ui);
const turret = createTurret({ scene, camera, game });
ui.score();

// VR: de trekker van een controller schiet. De kijkrichting wordt in VR door je hoofd bepaald.
const controller = renderer.xr.getController(0);
controller.addEventListener('selectstart', () => (turret.keys.fire = true));
controller.addEventListener('selectend', () => (turret.keys.fire = false));
turret.yawGroup.add(controller);

// ---------------------------------------------------------------------
// 4. STATE VAN DE SIMULATIE
// ---------------------------------------------------------------------
const SIM_SECONDS_PER_REAL_SECOND = 600; // 1 echte seconde = 10 gesimuleerde minuten
let simHour = 10; // gesimuleerd uur van de dag (UTC+1)
let simDoy = Math.floor((Date.now() - Date.UTC(new Date().getFullYear(), 0, 0)) / 86400000); // vandaag
let simPlaying = true;
el.season.value = String(simDoy);

const gridState = createGridState();
let flows = { chargeMW: 0, dischargeMW: 0, importMW: 0, exportMW: 0, surplusMW: 0 };
let last = { wind: 0, dir: 0, windMW: 0, solarMW: 0, demandMW: 0, yawErrorDeg: 0, sun: { altitude: 0, bearing: 0 }, cloud: 0 };
let scenarioResult = null;
let apiKey = '';

const RED = new THREE.Color(0xff2222);
const GREEN = new THREE.Color(0x22ff55);
const DAY = new THREE.Color(0x87ceeb);
const NIGHT = new THREE.Color(0x0a1030);
const sunDir = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

function setPlaying(on) {
  simPlaying = on;
  el.play.textContent = on ? '⏸ Pauze' : '▶ Speel af';
}

// ---------------------------------------------------------------------
// 5. BRON VAN DE WIND: slider (handmatig), live (Open-Meteo, fase 2) of sensor (hardware)
// De scène kent één "effectieve" windsnelheid en -richting; deze functies kiezen waar ze vandaan komen.
// ---------------------------------------------------------------------
let source = 'manual'; // 'manual' | 'live' | 'sensor'
let liveWind = null; // { speed, direction, cloud, time }
let liveTimer = null;
let sensorEnabled = false;
const sensorVals = { wind: null, dir: null };

function currentWind() {
  if (source === 'live' && liveWind) return liveWind.speed;
  if (source === 'sensor' && sensorVals.wind !== null) return sensorVals.wind;
  return Number(el.wind.value);
}
function currentWindDir() {
  if (source === 'live' && liveWind) return liveWind.direction;
  if (source === 'sensor' && sensorVals.dir !== null) return sensorVals.dir;
  return Number(el.windDir.value);
}
function currentCloud() {
  return source === 'live' && liveWind ? liveWind.cloud : 0; // handmatig: onbewolkt
}

function updateSourceUI() {
  const auto = source !== 'manual';
  el.wind.disabled = auto;
  el.windDir.disabled = auto;
  if (source === 'live') {
    el.source.textContent = `Live: Noordzee, ${liveWind.time} · wind uit ${compassName(liveWind.direction)} · bewolking ${liveWind.cloud}%`;
  } else if (source === 'sensor') {
    el.source.textContent = 'Wind van de sensor (hardware)';
  } else {
    el.source.textContent = 'Handmatige wind (slider)';
  }
}

// Terug naar handmatig, met de laatste waarden als startpunt van de sliders.
function setManual() {
  if (source !== 'manual') {
    el.wind.value = String(Math.min(30, Math.round(currentWind() * 2) / 2));
    el.windDir.value = String(Math.round(currentWindDir()) % 360);
  }
  source = 'manual';
  sensorEnabled = false;
  clearInterval(liveTimer);
  updateSourceUI();
}

async function enableLive() {
  el.source.textContent = 'Live data laden…';
  try {
    liveWind = await fetchLiveWind();
    source = 'live';
    sensorEnabled = false;
    clearInterval(liveTimer);
    liveTimer = setInterval(async () => {
      try {
        liveWind = await fetchLiveWind();
        updateSourceUI();
      } catch {
        /* behoud de vorige waarde */
      }
    }, 10 * 60 * 1000); // Open-Meteo ververst elke 15 min
    updateSourceUI();
    return true;
  } catch {
    // Terugval: de sliders blijven werken als het netwerk of de API faalt.
    setManual();
    el.source.textContent = 'Live data mislukt, handmatige wind';
    return false;
  }
}

// Sensor (Web Serial of gesimuleerd): zodra er data binnenkomt, stuurt de sensor de wind.
function onSensorData(data) {
  if (!data || !sensorEnabled) return;
  if (data.wind !== undefined) sensorVals.wind = data.wind;
  if (data.dir !== undefined) sensorVals.dir = data.dir;
  source = 'sensor';
  clearInterval(liveTimer);
  updateSourceUI();
  el.hwStatus.textContent = `Sensor: ${sensorVals.wind ?? '—'} m/s, ${sensorVals.dir ?? '—'}°`;
}
const serialSensor = createSerialSensor(onSensorData, (msg) => (el.hwStatus.textContent = msg));
const simSensor = createSimulatedSensor(onSensorData);
$('#btnSerial').addEventListener('click', async () => {
  sensorEnabled = true;
  if (!(await serialSensor.connect())) sensorEnabled = false;
});
$('#btnSimSensor').addEventListener('click', () => {
  if (simSensor.running) {
    simSensor.stop();
    setManual();
    el.hwStatus.textContent = 'Gesimuleerde sensor gestopt.';
  } else {
    sensorEnabled = true;
    simSensor.start();
    el.hwStatus.textContent = 'Gesimuleerde sensor (geen echte hardware) draait…';
  }
});

// ---------------------------------------------------------------------
// 6. ASSISTENT: een snapshot van de actuele waarden, dezelfde die de modellen gebruiken
// ---------------------------------------------------------------------
function snapshot() {
  const m = money(gridState, Number(el.price.value));
  const toDeg = 180 / Math.PI;
  return {
    time: formatHour(simHour),
    date: dayLabel(simDoy),
    wind: { speed: last.wind, dirDeg: last.dir, dirName: compassName(last.dir), live: source === 'live', source },
    windMW: last.windMW,
    windRatedMW: TURBINE.ratedMW * TURBINE_COUNT,
    yawErrorDeg: last.yawErrorDeg,
    solar: {
      MW: last.solarMW,
      altitudeDeg: last.sun.altitude * toDeg,
      cloudPct: last.cloud,
      tiltDeg: Number(el.tilt.value),
      orientation: el.orient.value,
    },
    grid: {
      demandMW: last.demandMW,
      importMW: flows.importMW,
      exportMW: flows.exportMW,
      batteryOn: el.battery.checked,
      socMWh: gridState.soc,
      socPct: (gridState.soc / GRID.batteryMWh) * 100,
      chargeMW: flows.chargeMW,
      dischargeMW: flows.dischargeMW,
    },
    totals: {
      windMWh: gridState.windMWh,
      solarMWh: gridState.solarMWh,
      importMWh: gridState.importMWh,
      exportMWh: gridState.exportMWh,
      co2Tonnes: co2SavedTonnes(gridState.windMWh) + solarCo2SavedTonnes(gridState.solarMWh),
      ...m,
    },
    priceEurPerMWh: Number(el.price.value),
    scenario: scenarioResult,
    game: { score: game.state.score, kills: game.state.kills, playing: game.state.playing },
  };
}

async function ask(question) {
  el.askLog.textContent = 'Even denken…';
  const { text, source: from } = await answer(question, snapshot(), apiKey);
  el.askLog.textContent = `[${from}] ${text}`;
  return text;
}
$('#askForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#askInput');
  if (input.value.trim()) ask(input.value.trim());
  input.value = '';
});
$('#apiKey').addEventListener('input', (e) => (apiKey = e.target.value.trim()));

// ---------------------------------------------------------------------
// 7. SCENARIO'S VERGELIJKEN: twee volledige dagen simuleren met dezelfde omstandigheden
// ---------------------------------------------------------------------
const panelCount = world.solarPanels.length;
const fmt = (x, d = 0) => Number(x).toFixed(d);

function runComparison() {
  const base = {
    doy: simDoy,
    tiltRad: (Number(el.tilt.value) * Math.PI) / 180,
    cloudPct: currentCloud(),
    windMW: last.windMW,
    panelCount,
  };
  const orientation = el.orient.value;
  const south = simulateDay({ ...base, orientation: 'south', battery: el.battery.checked });
  const ew = simulateDay({ ...base, orientation: 'ew', battery: el.battery.checked });
  const noBattery = simulateDay({ ...base, orientation, battery: false });
  const battery = simulateDay({ ...base, orientation, battery: true });
  scenarioResult = { south, ew, noBattery, battery };

  const price = Number(el.price.value);
  const net = (r) => {
    const m = money({ windMWh: r.windMWh, solarMWh: r.solarMWh, importMWh: r.importMWh, exportMWh: r.exportMWh }, price);
    return m.savedEur + m.exportEur - m.importEur;
  };
  const row = (label, a, b, d = 0) => `<tr><td>${label}</td><td>${fmt(a, d)}</td><td>${fmt(b, d)}</td></tr>`;
  const better = (a, b) => (a >= b ? 'Zuid' : 'Oost-west');
  el.scenTable.innerHTML =
    `<p><b>A. Zonne-opstelling</b> op ${dayLabel(simDoy)} (oost-west max. 15° helling)</p>` +
    `<table><tr><th></th><th>Zuid</th><th>Oost-west</th></tr>` +
    row('Zon MWh/dag', south.solarMWh, ew.solarMWh) +
    row('Piek MW', south.peakSolarMW, ew.peakSolarMW, 1) +
    row('Import MWh', south.importMWh, ew.importMWh) +
    row('Export MWh', south.exportMWh, ew.exportMWh) +
    row('Zelfvoorzienend %', south.selfSufficiency * 100, ew.selfSufficiency * 100) +
    row('Netto €/dag', net(south), net(ew)) +
    `</table><p>Meer energie op deze dag: <b>${better(south.solarMWh, ew.solarMWh)}</b>.</p>` +
    `<p><b>B. Batterij</b> (${orientation === 'ew' ? 'oost-west' : 'zuid'})</p>` +
    `<table><tr><th></th><th>Zonder</th><th>Met</th></tr>` +
    row('Import MWh', noBattery.importMWh, battery.importMWh) +
    row('Export MWh', noBattery.exportMWh, battery.exportMWh) +
    row('Zelfvoorzienend %', noBattery.selfSufficiency * 100, battery.selfSufficiency * 100) +
    row('Netto €/dag', net(noBattery), net(battery)) +
    `</table><p>De batterij bespaart <b>${fmt(noBattery.importMWh - battery.importMWh)} MWh</b> import per dag.</p>`;

  scenChart.draw(
    [
      { values: south.solar, color: '#ffd640', fill: true },
      { values: ew.solar, color: '#4fd1ff', width: 2 },
    ],
    null,
    Math.max(10, Math.ceil(Math.max(south.peakSolarMW, ew.peakSolarMW) / 10) * 10),
  );
  return scenarioResult;
}
$('#btnCompare').addEventListener('click', runComparison);

// ---------------------------------------------------------------------
// 8. COMMANDO'S (spraak én knoppen komen hier uit; zo is er één plek met het gedrag)
// ---------------------------------------------------------------------
async function runCommand(cmd) {
  switch (cmd.name) {
    case 'wind-delta':
      setManual();
      el.wind.value = String(Math.min(30, Math.max(0, Number(el.wind.value) + cmd.value)));
      return `Wind ${cmd.value > 0 ? 'omhoog' : 'omlaag'} naar ${el.wind.value} m/s`;
    case 'wind-set':
      setManual();
      el.wind.value = String(Math.min(30, Math.max(0, cmd.value)));
      return `Wind op ${el.wind.value} m/s gezet`;
    case 'wind-dir':
      setManual();
      el.windDir.value = String(cmd.value);
      return `Wind uit ${compassName(cmd.value)} (${cmd.value} graden)`;
    case 'live':
      return (await enableLive()) ? `Live wind: ${liveWind.speed.toFixed(1)} m/s uit ${compassName(liveWind.direction)}` : 'Live data is niet beschikbaar';
    case 'sun-hour':
      simHour = cmd.value % 24;
      return `De zon staat op ${formatHour(simHour)} uur`;
    case 'sun-doy':
      simDoy = cmd.value;
      el.season.value = String(simDoy);
      return `Datum gezet op ${dayLabel(simDoy)}`;
    case 'sim-pause':
      setPlaying(false);
      return 'Tijd gepauzeerd';
    case 'sim-play':
      setPlaying(true);
      return 'Tijd loopt versneld';
    case 'battery':
      el.battery.checked = cmd.value;
      return `Batterij ${cmd.value ? 'aan' : 'uit'}`;
    case 'orientation':
      el.orient.value = cmd.value;
      return `Panelen ${cmd.value === 'ew' ? 'oost-west' : 'naar het zuiden'}`;
    case 'compare': {
      $('#secScen').open = true;
      const r = runComparison();
      return `Op ${dayLabel(simDoy)} levert zuid ${fmt(r.south.solarMWh)} en oost-west ${fmt(r.ew.solarMWh)} megawattuur. De batterij bespaart ${fmt(r.noBattery.importMWh - r.battery.importMWh)} megawattuur import.`;
    }
    case 'ask-power':
      return `Wind ${last.windMW.toFixed(1)} megawatt en zon ${last.solarMW.toFixed(1)} megawatt, bij ${last.demandMW.toFixed(1)} megawatt verbruik`;
    case 'ask-solar':
      return `De zonnepanelen produceren ${last.solarMW.toFixed(1)} megawatt, ${gridState.solarMWh.toFixed(0)} megawattuur tot nu toe`;
    case 'ask-money': {
      const m = money(gridState, Number(el.price.value));
      return `Besparing ${fmt(m.savedEur)} euro, export ${fmt(m.exportEur)} euro, importkosten ${fmt(m.importEur)} euro`;
    }
    case 'ask-co2':
      return `We besparen ${(co2SavedTonnes(gridState.windMWh) + solarCo2SavedTonnes(gridState.solarMWh)).toFixed(1)} ton CO2 tegenover aardgas`;
    case 'reset':
      $('#reset').click();
      return 'Opnieuw gestart';
  }
}

async function handleCommand(cmd, heard) {
  const result = await runCommand(cmd);
  el.voiceLog.textContent = (heard ? `Verstaan: "${heard}" → ` : '') + result;
  speak(result);
}

async function handleSpeech(transcript) {
  const cmd = parseCommand(transcript);
  if (cmd) return handleCommand(cmd, transcript);
  // Geen commando herkend: geef de zin aan de assistent.
  el.voiceLog.textContent = `Verstaan: "${transcript}" → vraag aan de assistent…`;
  const text = await ask(transcript);
  el.voiceLog.textContent = `Verstaan: "${transcript}" → ${text}`;
  speak(text);
}

const startListening = createRecognizer(handleSpeech, (s) => {
  if (s) el.voiceLog.textContent = s;
});
const micBtn = $('#mic');
if (startListening) micBtn.addEventListener('click', startListening);
else {
  micBtn.disabled = true;
  micBtn.title = 'Spraak wordt niet ondersteund in deze browser (gebruik Chrome of Edge)';
}

// Knoppen en sliders als terugval voor dezelfde commando's
$('#btnMore').addEventListener('click', () => handleCommand({ name: 'wind-delta', value: 3 }));
$('#btnLess').addEventListener('click', () => handleCommand({ name: 'wind-delta', value: -3 }));
$('#btnLive').addEventListener('click', () => handleCommand({ name: 'live' }));
$('#btnAsk').addEventListener('click', () => handleCommand({ name: 'ask-power' }));
$('#btnAskSolar').addEventListener('click', () => handleCommand({ name: 'ask-solar' }));
el.wind.addEventListener('input', setManual);
el.windDir.addEventListener('input', setManual);
el.hour.addEventListener('input', () => (simHour = Number(el.hour.value)));
el.season.addEventListener('input', () => (simDoy = Number(el.season.value)));
el.play.addEventListener('click', () => setPlaying(!simPlaying));
$('#reset').addEventListener('click', () => {
  Object.assign(gridState, createGridState());
  windChart.clear();
  game.start();
});
$('#hudToggle').addEventListener('click', () => $('#hud').classList.toggle('hidden'));
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyH' && !(e.target instanceof HTMLInputElement)) $('#hud').classList.toggle('hidden');
});

// Windturbines starten al naar de wind gericht (anders zwaaien ze de eerste seconden).
for (const t of world.turbines) t.rotation.y = Math.PI - THREE.MathUtils.degToRad(Number(el.windDir.value));

// ---------------------------------------------------------------------
// 9. RENDER LOOP
// animate() draait ~60x per seconde (of per frame van de VR-headset). Beweging = elk frame een klein beetje veranderen.
// dt (seconden sinds vorig frame) maakt de snelheid onafhankelijk van de framerate.
// ---------------------------------------------------------------------
const YAW_RATE = 0.5; // rad/s: hoe snel een windturbine zich naar de wind kan draaien
const angleDiff = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
let lastTime = performance.now();
let chartTimer = 1;
let scenTimer = 0;

function animate(now) {
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  const t = now / 1000;

  // --- Gesimuleerde klok (als "Speel af" aan staat) -------------------------------
  const simDelta = simPlaying ? dt * SIM_SECONDS_PER_REAL_SECOND : 0; // gesimuleerde seconden
  if (simPlaying) simHour = (simHour + simDelta / 3600) % 24;
  el.hour.value = String(simHour);
  el.hourLabel.textContent = formatHour(simHour);
  el.seasonLabel.textContent = dayLabel(simDoy);

  // --- ZON: positie door dag en seizoen (SunCalc) stuurt licht, schaduw, luchtkleur en stralen ---
  const sunPos = sunPosition(simDoy, simHour);
  const d = sunDirection(sunPos);
  sunDir.set(d.x, d.y, d.z);
  const dayFactor = THREE.MathUtils.clamp((sunPos.altitude + 0.1) / 0.35, 0, 1); // 0 = nacht, 1 = volle dag
  world.sun.position.copy(sunDir).multiplyScalar(80); // het licht komt vanuit de richting van de zon
  world.sun.intensity = sunPos.altitude > 0 ? 3.2 * dayFactor : 0;
  world.ambient.intensity = 0.12 + 0.9 * dayFactor;
  scene.background.copy(NIGHT).lerp(DAY, dayFactor);
  scene.fog.color.copy(scene.background);
  world.sunSphere.position.copy(sunDir).multiplyScalar(200);
  world.sunSphere.scale.setScalar(2);
  world.sunSphere.visible = sunPos.altitude > 0;

  // Paneelhoek en -richting uit de sliders; zonnestralen van de zon naar elk paneel.
  const orientation = el.orient.value;
  const tilt = effectiveTilt(THREE.MathUtils.degToRad(Number(el.tilt.value)), orientation);
  el.tiltLabel.textContent = `${el.tilt.value}°${orientation === 'ew' && Number(el.tilt.value) > 15 ? ' (oost-west: max 15°)' : ''}`;
  const rayPos = world.rays.geometry.attributes.position;
  world.solarPanels.forEach((p, i) => {
    // Zuid: alle panelen naar het zuiden. Oost-west: om en om oost (+90°) en west (-90°).
    const yaw = orientation === 'ew' ? (i % 2 === 0 ? Math.PI / 2 : -Math.PI / 2) : 0;
    p.rotation.set(tilt, yaw, 0);
    p.getWorldPosition(tmpVec);
    rayPos.setXYZ(i * 2, tmpVec.x + sunDir.x * 40, tmpVec.y + sunDir.y * 40, tmpVec.z + sunDir.z * 40);
    rayPos.setXYZ(i * 2 + 1, tmpVec.x, tmpVec.y, tmpVec.z);
  });
  rayPos.needsUpdate = true;
  world.rays.visible = sunPos.altitude > 0.02;

  // Productie: P = aantal · oppervlak · rendement · straling · cos(hoek zon-paneel)
  const cloud = currentCloud();
  const solarMW = solarFieldMW(sunPos, tilt, cloud, panelCount, orientation);
  const PEAK_MW = (panelCount * 25000 * 0.2) / 1000; // 60 MW: maximum bij 1000 W/m² loodrecht
  const glow = solarMW / PEAK_MW; // 0..1: de panelen lichten op als ze veel produceren
  for (const p of world.solarPanels) p.material.emissive.setRGB(0, 0.25 * glow, 0.9 * glow);
  el.sunInfo.textContent =
    sunPos.altitude > 0
      ? `Zon: ${Math.round((sunPos.altitude * 180) / Math.PI)}° hoog, uit ${compassName((sunPos.bearing * 180) / Math.PI)}`
      : 'Zon: onder de horizon';

  // --- WIND: snelheid én richting bepalen draaisnelheid en opbrengst ----------------
  // De turbine draait zich met beperkte snelheid naar de wind. Staat hij scheef (fout err), dan vangt hij
  // maar wind · cos(err) op, dus een richtingsverandering kost tijdelijk opbrengst.
  const wind = currentWind();
  const dirDeg = currentWindDir();
  el.windLabel.textContent = `${wind.toFixed(1)} m/s`;
  el.windDirLabel.textContent = `uit ${compassName(dirDeg)} (${Math.round(dirDeg)}°)`;
  const targetYaw = Math.PI - THREE.MathUtils.degToRad(dirDeg); // 0° = noord = -z, rotatie rond y
  let windMW = 0;
  let maxErr = 0;
  for (const turbine of world.turbines) {
    const step = YAW_RATE * dt;
    turbine.rotation.y += THREE.MathUtils.clamp(angleDiff(turbine.rotation.y, targetYaw), -step, step);
    const err = angleDiff(turbine.rotation.y, targetYaw);
    maxErr = Math.max(maxErr, Math.abs(err));
    const effective = wind * Math.max(0, Math.cos(err));
    const mw = turbinePowerMW(effective);
    windMW += mw;
    turbine.userData.hub.rotation.z += rotorSpeed(effective) * dt;
    turbine.userData.lamp.material.emissive.lerpColors(RED, GREEN, mw / TURBINE.ratedMW);
  }

  // --- NET: wind + zon voeden het verbruik; batterij vangt overschot en tekort op ----
  const demand = demandMW(simHour);
  flows = stepGrid(gridState, { windMW, solarMW, demandMW: demand }, simDelta / 3600, el.battery.checked);
  last = { wind, dir: dirDeg, windMW, solarMW, demandMW: demand, yawErrorDeg: (maxErr * 180) / Math.PI, sun: sunPos, cloud };

  // Visuele aanwijzingen: batterij-vulbalk (rood -> groen) en lichtjes in het dorp (meer verbruik = meer licht, 's nachts feller)
  const soc = gridState.soc / GRID.batteryMWh;
  const fill = world.battery.userData.fill;
  fill.scale.y = Math.max(0.03, soc);
  fill.position.y = 0.85 + 0.65 * Math.max(0.03, soc);
  fill.material.color.lerpColors(RED, GREEN, soc);
  const lights = THREE.MathUtils.clamp(demand / 36, 0, 1) * (1.4 - 1.1 * dayFactor);
  for (const w of world.villageWindows) w.emissiveIntensity = lights;

  // --- HUD -----------------------------------------------------------------
  const m = money(gridState, Number(el.price.value));
  el.priceLabel.textContent = `€${el.price.value}/MWh`;
  el.power.textContent = `${windMW.toFixed(1)} MW`;
  el.energy.textContent = `${gridState.windMWh.toFixed(1)} MWh`;
  el.solarPower.textContent = `${solarMW.toFixed(1)} MW`;
  el.solarEnergy.textContent = `${gridState.solarMWh.toFixed(0)} MWh`;
  const balance = flows.importMW > 0.05 ? `import ${flows.importMW.toFixed(1)} MW` : `export ${flows.exportMW.toFixed(1)} MW`;
  el.gridInfo.innerHTML =
    `Verbruik <b>${demand.toFixed(1)} MW</b> · productie <b>${(windMW + solarMW).toFixed(1)} MW</b> → ${balance}<br>` +
    `Batterij ${el.battery.checked ? '' : '(uit) '}<b>${(soc * 100).toFixed(0)}%</b> (${gridState.soc.toFixed(1)} MWh)` +
    `${flows.chargeMW > 0.1 ? `, laadt ${flows.chargeMW.toFixed(1)} MW` : flows.dischargeMW > 0.1 ? `, ontlaadt ${flows.dischargeMW.toFixed(1)} MW` : ''}`;
  el.moneyInfo.innerHTML =
    `Bespaard (zelf gebruikt): <b>€${fmt(m.savedEur)}</b><br>Export: <b>€${fmt(m.exportEur)}</b> · Import: <b>€${fmt(m.importEur)}</b><br>` +
    `Netto: <b>${m.savedEur + m.exportEur - m.importEur >= 0 ? '+' : '−'}€${fmt(Math.abs(m.savedEur + m.exportEur - m.importEur))}</b>`;
  const co2t = co2SavedTonnes(gridState.windMWh) + solarCo2SavedTonnes(gridState.solarMWh);
  el.co2.innerHTML = `CO₂ bespaard: <b>${co2t.toFixed(1)} ton</b> (≈ €${fmt(co2t * MONEY.co2Price)} bij €${MONEY.co2Price}/t)`;

  // Grafieken: lopende windgrafiek, en dagcurves (zon, net) voor de gekozen datum
  chartTimer += dt;
  if (chartTimer > 0.25) {
    chartTimer = 0;
    windChart.push(windMW);
    const solarCurve = [];
    const demandCurve = [];
    const prodCurve = [];
    for (let i = 0; i <= 96; i++) {
      const s = solarFieldMW(sunPosition(simDoy, i / 4), tilt, cloud, panelCount, orientation);
      solarCurve.push(s);
      prodCurve.push(s + windMW);
      demandCurve.push(demandMW(i / 4));
    }
    solarChart.draw([{ values: solarCurve, color: '#ffd640', fill: true }], simHour / 24);
    const gridMax = Math.max(40, Math.ceil(Math.max(...prodCurve, ...demandCurve) / 10) * 10);
    gridChart.draw(
      [
        { values: prodCurve, color: '#7CFC9A', fill: true, fillColor: 'rgba(124,252,154,0.25)' },
        { values: demandCurve, color: '#ffffff' },
      ],
      simHour / 24,
      gridMax,
    );
  }
  // Scenario's automatisch bijwerken terwijl dat paneel openstaat
  scenTimer += dt;
  if (scenTimer > 1 && $('#secScen').open) {
    scenTimer = 0;
    runComparison();
  }

  // --- Spel, kanon, radar -------------------------------------------------------
  game.update(dt, t);
  turret.update(dt, renderer.xr.isPresenting);
  el.crosshair.className = turret.aimKind();
  radar.draw({ yaw: turret.yaw, world, game, windFromDeg: dirDeg, sun: sunPos });

  renderer.render(scene, camera);
}

// setAnimationLoop werkt zowel op een gewoon scherm als in een VR-headset (requestAnimationFrame niet).
renderer.setAnimationLoop(animate);
