import { captureSquare, closeCamera, openCamera } from './camera.mjs';
import { judge, labels, THRESHOLD } from './quest.mjs';

const byId = id => document.getElementById(id);
const loopback = ['127.0.0.1', 'localhost'].includes(location.hostname);
const preview = loopback && new URLSearchParams(location.search).get('preview') === '1';
const video = byId('camera');
const button = byId('action');
const stop = byId('stop');
const status = byId('status');
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 224;
const storageKey = preview ? 'handgebaarquest-simulatie' : 'handgebaarquest';
let target;
let pending;
let device;
let model;
let busy = false;
let pageActive = true;

function controls(message) {
  if (message) status.textContent = message;
  button.disabled = busy;
  stop.disabled = busy;
  stop.hidden = video.hidden;
  byId('placeholder').hidden = !video.hidden;
  byId('prediction').disabled = busy;
  button.textContent = pending ? 'Punten opnieuw opslaan' : !target ? 'Opdracht ophalen' :
    preview || !video.hidden ? 'Scan gebaar' : 'Start camera';
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => {
      script.remove();
      reject(new Error('De modelbibliotheek kon niet laden. Controleer je internet.'));
    };
    document.head.append(script);
  });
}

async function loadModel() {
  const resources = await Promise.all(['model.json', 'metadata.json'].map(name =>
    fetch('./model/' + name, { method: 'HEAD', cache: 'no-store' })));
  if (resources.some(result => !result.ok)) {
    throw new Error('Je model ontbreekt. Train eerst de drie klassen en plaats de TensorFlow.js-export in public/model.');
  }
  if (!globalThis.tf) await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.3.1/dist/tf.min.js');
  if (!globalThis.tmImage) await loadScript('https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.3/dist/teachablemachine-image.min.js');
  try {
    const candidate = await globalThis.tmImage.load('./model/model.json', './model/metadata.json');
    const available = candidate.getClassLabels().map(label => label.trim().toLowerCase());
    if (available.length !== labels.length || !labels.every(label => available.includes(label.toLowerCase()))) {
      throw new Error('Andere labels');
    }
    return candidate;
  } catch {
    throw new Error('Controleer of de modelbestanden compleet zijn en Peace, Middelvinger en Geen gebaar als labels gebruiken.');
  }
}

function initializeDevice() {
  device = localStorage.getItem(storageKey) ?? crypto.randomUUID();
  localStorage.setItem(storageKey, device);
  pending = JSON.parse(localStorage.getItem(storageKey + '-pending') ?? 'null');
}

async function score(attempt) {
  const result = await fetch('/.netlify/functions/score', {
    method: attempt ? 'POST' : 'GET',
    cache: 'no-store',
    headers: { 'X-Quest-Device': device, ...(attempt && { 'Content-Type': 'application/json' }) },
    body: attempt ? JSON.stringify(attempt) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (!result.ok && result.status !== 409) throw new Error('De puntenserver reageert niet. Probeer opnieuw.');
  const data = await result.json();
  if (!Number.isSafeInteger(data.points) || !labels.includes(data.target)) throw new Error('Kan je score niet ophalen.');
  byId('points').textContent = data.points;
  target = data.target;
  byId('target').textContent = target;
  return result.ok;
}

async function saveAttempt() {
  const saved = await score(pending);
  localStorage.removeItem(storageKey + '-pending');
  pending = null;
  controls(saved ? 'Gelukt! +10 punten. Je volgende gebaar staat hierboven.' :
    'De opdracht is intussen veranderd. Scan het gebaar dat nu gevraagd wordt.');
}

async function predict() {
  if (preview) return [{ className: byId('prediction').value, probability: 0.97 }];
  captureSquare(video, canvas);
  try {
    return await model.predict(canvas);
  } finally {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }
}

async function scan() {
  controls('Hou je gebaar stil…');
  const frames = [await predict()];
  for (let index = 1; index < 3; index++) {
    await new Promise(resolve => setTimeout(resolve, 300));
    frames.push(await predict());
  }
  const confidence = judge(frames, target);
  if (confidence < THRESHOLD) {
    controls('Geen punten. Maak ' + target + ' en hou je hele hand in het midden van het beeld.');
    return;
  }
  pending = { id: crypto.randomUUID(), target, confidence };
  localStorage.setItem(storageKey + '-pending', JSON.stringify(pending));
  await saveAttempt();
}

async function refresh() {
  if (!device) initializeDevice();
  await score();
  controls(pending ? 'Je vorige ronde staat klaar om opnieuw op te slaan.' :
    preview ? 'Kies de voorspelling en klik op Scan gebaar.' : 'Start je camera om te spelen.');
}

async function run(job) {
  busy = true;
  controls();
  try {
    await job();
  } catch (error) {
    controls(error.message);
  } finally {
    busy = false;
    controls();
  }
}

button.addEventListener('click', () => run(async () => {
  if (pending) await saveAttempt();
  else if (!target) await refresh();
  else if (preview || !video.hidden) await scan();
  else {
    controls('Model laden en camera starten…');
    model ??= await loadModel();
    if (!pageActive) return;
    await openCamera(video, 'user');
    if (pageActive) controls('Hou je hele hand in het midden van het beeld.');
    else closeCamera(video);
  }
}));
stop.addEventListener('click', () => {
  closeCamera(video);
  controls('Camera staat uit.');
});
window.addEventListener('pagehide', () => {
  pageActive = false;
  closeCamera(video);
});
window.addEventListener('pageshow', () => {
  pageActive = true;
  controls();
});
if (location.protocol !== 'file:') {
  byId('local-nav').hidden = !loopback;
  byId('preview').hidden = !preview;
  byId('viewfinder').hidden = preview;
  if (preview) {
    byId('other-mode').href = './';
    byId('other-mode').textContent = 'Met eigen model spelen';
  }
  run(refresh);
}
