import { judgeScan } from './quest.mjs';

const ui = Object.fromEntries(
  ['points', 'before-step', 'after-step', 'camera', 'camera-placeholder', 'messy', 'tidy', 'status', 'action', 'stop',
    'preview-controls', 'preview-class', 'preview-camera', 'preview-link']
    .map(id => [id, document.getElementById(id)]),
);
const local = ['127.0.0.1', 'localhost'].includes(location.hostname);
const preview = local && new URLSearchParams(location.search).get('preview') === '1';
const storageKey = preview ? 'opruimquest-preview-device' : 'opruimquest-device';
const pendingKey = preview ? 'opruimquest-preview-pending' : 'opruimquest-pending';
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 224;
const ctx = canvas.getContext('2d');
const endpoint = '/.netlify/functions/score';
let model;
let stream;
let before;
let pending;
let device;
let busy = false;
let pageActive = true;

function setStatus(message) {
  ui.status.textContent = message;
}

function updateControls() {
  ui.action.disabled = busy;
  ui.stop.disabled = busy;
  ui.stop.hidden = !stream;
  ui['preview-camera'].hidden = Boolean(stream);
  ui['preview-camera'].disabled = busy;
  ui['preview-class'].disabled = busy;
  ui.action.textContent = pending ? 'Punten opnieuw opslaan' : !stream && !preview ? 'Start camera' : before ? 'Scan na het opruimen' : 'Scan vóór het opruimen';
  ui['before-step'].setAttribute('aria-current', before || pending ? 'false' : 'step');
  ui['after-step'].setAttribute('aria-current', before || pending ? 'step' : 'false');
}

function stopCamera() {
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  ui.camera.srcObject = null;
  ui.camera.hidden = true;
  ui['camera-placeholder'].hidden = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => {
      script.remove();
      reject(new Error('De modelbibliotheek kon niet laden. Controleer je internetverbinding.'));
    };
    document.head.append(script);
  });
}

async function getModel() {
  if (model) return model;
  const files = await Promise.all(['model.json', 'metadata.json'].map(name =>
    fetch('./model/' + name, { method: 'HEAD', cache: 'no-store' })));
  if (files.some(file => !file.ok)) {
    throw new Error('Voeg eerst je TensorFlow.js-export toe in public/model.');
  }
  if (!globalThis.tf) await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.3.1/dist/tf.min.js');
  if (!globalThis.tmImage) await loadScript('https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.3/dist/teachablemachine-image.min.js');
  try {
    const loaded = await globalThis.tmImage.load('./model/model.json', './model/metadata.json');
    const labels = loaded.getClassLabels().map(label => label.trim().toLowerCase());
    if (labels.length !== 2 || !labels.includes('rommelig') || !labels.includes('netjes')) {
      throw new Error('Verkeerde klassen');
    }
    model = loaded;
    return model;
  } catch {
    throw new Error('Kan het model niet laden. Controleer de TensorFlow.js-export in public/model met de klassen Rommelig en Netjes.');
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Open de lokale serverlink op je pc of gebruik HTTPS op je smartphone.');
  setStatus(preview ? 'Webcam starten…' : 'Model laden en camera starten…');
  if (!preview) await getModel();
  try {
    const acquired = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      audio: false,
    });
    if (!pageActive) {
      acquired.getTracks().forEach(track => track.stop());
      return;
    }
    stream = acquired;
    ui.camera.srcObject = stream;
    await ui.camera.play();
    if (!pageActive || stream !== acquired) return;
    ui.camera.hidden = false;
    ui['camera-placeholder'].hidden = true;
    setStatus(preview ? 'Webcam werkt. De teststand blijft voorspellingen simuleren.' :
      before ? 'Richt de camera op dezelfde plek na het opruimen.' : 'Richt de camera op de rommelige stoelopstelling.');
  } catch {
    stopCamera();
    throw new Error('Camera niet beschikbaar. Controleer de cameratoestemming in je browser.');
  }
}

async function classifyFrame() {
  if (preview) {
    const selected = ui['preview-class'].value;
    return ['rommelig', 'netjes'].map(className => ({
      className,
      probability: selected === 'onzeker' ? 0.5 : selected === className ? 0.97 : 0.03,
    }));
  }
  if (!ui.camera.videoWidth || ui.camera.readyState < 2) throw new Error('De camera is nog niet klaar. Probeer opnieuw.');
  const { videoWidth: width, videoHeight: height } = ui.camera;
  const crop = Math.min(width, height);
  ctx.drawImage(ui.camera, (width - crop) / 2, (height - crop) / 2, crop, crop, 0, 0, canvas.width, canvas.height);
  try {
    return await model.predict(canvas);
  } finally {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

async function requestScore(payload) {
  const response = await fetch(endpoint, {
    method: payload ? 'POST' : 'GET',
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
    headers: { 'X-Quest-Device': device, ...(payload && { 'Content-Type': 'application/json' }) },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!response.ok) throw new Error('Puntenserver niet beschikbaar.');
  const { points } = await response.json();
  if (!Number.isSafeInteger(points) || points < 0) throw new Error('Ongeldige score ontvangen.');
  ui.points.textContent = points;
}

async function savePending() {
  setStatus('Punten opslaan…');
  try {
    await requestScore(pending);
    localStorage.removeItem(pendingKey);
  } catch {
    throw new Error('De score kon nog niet bevestigd worden. Probeer opnieuw met internetverbinding.');
  }
  pending = undefined;
  before = undefined;
  stopCamera();
  setStatus('Goed gedaan! Je ronde is opgeslagen en levert 10 punten op.');
}

async function scan() {
  setStatus('Even stilhouden terwijl de camera scant…');
  const frames = [];
  for (let index = 0; index < 3; index++) {
    if (index > 0) await new Promise(resolve => setTimeout(resolve, 280));
    frames.push(await classifyFrame());
  }
  const messy = judgeScan(frames, 'rommelig');
  const tidy = judgeScan(frames, 'netjes');
  ui.messy.textContent = Math.round(messy.score * 100) + '%';
  ui.tidy.textContent = Math.round(tidy.score * 100) + '%';

  if (!before) {
    if (!messy.accepted) {
      setStatus('Rommelig moet drie keer minstens 90% scoren. Kadreer de stoelen opnieuw en probeer nog eens.');
      return;
    }
    before = { score: messy.score, takenAt: performance.now() };
    setStatus('Vóórscan gelukt. Ruim de stoelen op en scan dezelfde plek opnieuw.');
    return;
  }
  if (!tidy.accepted) {
    setStatus('Netjes moet drie keer minstens 90% scoren. Kadreer de stoelen opnieuw en probeer nog eens.');
    return;
  }
  if (performance.now() - before.takenAt < 3000) {
    setStatus('Wacht minstens drie seconden tussen beide scans en scan dezelfde plek opnieuw.');
    return;
  }
  pending = { id: crypto.randomUUID(), before: before.score, after: tidy.score };
  localStorage.setItem(pendingKey, JSON.stringify(pending));
  await savePending();
}

ui.action.addEventListener('click', async () => {
  busy = true;
  updateControls();
  try {
    if (!device) initializeDevice();
    if (pending) await savePending();
    else if (stream || preview) await scan();
    else await startCamera();
  } catch (error) {
    setStatus(error.message);
  } finally {
    busy = false;
    updateControls();
  }
});

ui['preview-camera'].addEventListener('click', async () => {
  busy = true;
  updateControls();
  try {
    await startCamera();
  } catch (error) {
    setStatus(error.message);
  } finally {
    busy = false;
    updateControls();
  }
});

ui.stop.addEventListener('click', () => {
  stopCamera();
  setStatus('Camera staat uit.');
  updateControls();
});

window.addEventListener('pagehide', () => {
  pageActive = false;
  stopCamera();
  updateControls();
});
window.addEventListener('pageshow', () => { pageActive = true; });

function initializeDevice() {
  if (!globalThis.isSecureContext || !crypto.randomUUID) throw new Error('Open de app via HTTPS in een recente browser.');
  const existingDevice = localStorage.getItem(storageKey);
  const newDevice = existingDevice || crypto.randomUUID();
  const savedRound = localStorage.getItem(pendingKey);
  const savedPending = savedRound ? JSON.parse(savedRound) : undefined;
  localStorage.setItem(storageKey, newDevice);
  pending = savedPending;
  device = newDevice;
}

async function initialize() {
  ui['preview-controls'].hidden = !preview;
  ui['preview-link'].hidden = !local || preview;
  if (preview) {
    ui['camera-placeholder'].textContent = 'Simulatie is actief';
    setStatus('Kies Rommelig en maak de vóórscan.');
  }
  busy = true;
  updateControls();
  try {
    initializeDevice();
    if (pending) setStatus('Er staat nog een ronde klaar om de punten op te slaan.');
    await requestScore();
  } catch {
    if (!device) setStatus('Gebruik HTTPS en sta browseropslag toe om je punten te bewaren.');
  } finally {
    busy = false;
    updateControls();
  }
}

initialize();
