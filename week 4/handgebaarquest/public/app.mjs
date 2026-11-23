import { closeCamera, openCamera } from './camera.mjs';
import { hints, targets, THRESHOLD } from './quest.mjs';
import { loadModel } from './model.mjs';
import { createHandFilter, framingMessage, rankShapes } from './hands.mjs';

const byId = id => document.getElementById(id);
const loopback = ['127.0.0.1', 'localhost'].includes(location.hostname);
const preview = loopback && new URLSearchParams(location.search).get('preview') === '1';
const video = byId('camera');
const button = byId('action');
const stop = byId('stop');
const status = byId('status');
const cameraPreview = byId('hand-preview');
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 224;
const storageKey = preview ? 'handalfabet-simulatie' : 'handalfabet';
let target;
let pending;
let device;
let model;
let handFilter;
let busy = false;
let pageActive = true;
let watching = false;
let timer;
let lastVideoTime = -1;
let frames = [];
let enrollment = 0;
let saveAfter = 0;

function controls(message) {
  if (message) status.textContent = message;
  button.disabled = busy;
  stop.hidden = !watching;
  cameraPreview.hidden = video.hidden;
  byId('placeholder').hidden = !video.hidden;
  button.hidden = watching || preview;
  button.textContent = !target ? 'Opdracht ophalen' : 'Start camera';
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
  if (!Number.isSafeInteger(data.points) || !targets.includes(data.target)) throw new Error('Kan je score niet ophalen.');
  byId('points').textContent = data.points;
  target = data.target;
  byId('target').textContent = target;
  byId('hint').textContent = hints[target];
  const progress = (data.points / 10) % targets.length;
  byId('word').replaceChildren(...targets.map((letter, index) => {
    const span = document.createElement('span');
    span.textContent = letter;
    if (index < progress) span.dataset.completed = '';
    return span;
  }));
  return result.ok;
}

async function saveAttempt() {
  const letter = pending.target;
  const saved = await score(pending);
  localStorage.removeItem(storageKey + '-pending');
  pending = null;
  const feedback = letter === targets.at(-1) ? 'VOL gespeld! +10 punten voor de laatste letter.' :
    'Letter ' + letter + ' herkend. +10 punten.';
  controls(saved ? feedback : 'De opdracht is intussen veranderd. Scan de letter die nu gevraagd wordt.');
}

function showRecognition(name, probability, mode) {
  byId('recognized').textContent = name;
  byId('confidence-label').textContent = mode;
  byId('confidence').textContent = probability === undefined ? '–' : Math.round(probability * 100) + '%';
}

async function predict() {
  if (preview) return { mode: 'Testzekerheid', predictions: [{ className: byId('prediction').value, probability: 0.97 }] };
  if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  const isolated = handFilter.crop(video, canvas, performance.now(), cameraPreview);
  if (isolated.status !== 'hand') return { status: isolated.status };
  if (model?.getMetadata()?.userMetadata?.preprocessing === 'hand-crop-v1') {
    return { mode: 'Modelzekerheid', predictions: await model.predict(canvas) };
  }
  return { mode: 'Handvormscore', predictions: rankShapes(isolated.points) };
}

async function watch(session) {
  if (!watching || session !== enrollment) return;
  try {
    const result = await predict();
    if (!watching || session !== enrollment) return;
    if (result?.predictions) {
      const best = result.predictions.reduce((a, b) => a.probability > b.probability ? a : b);
      showRecognition(best.className, best.probability, result.mode);
      const correct = best.className === target && best.probability >= THRESHOLD;
      frames = correct ? [...frames.slice(-2), best.probability] : [];
    } else if (result) {
      frames = [];
      showRecognition(framingMessage(result.status), undefined, 'Zekerheid');
    }
    if (!pending && target && frames.length === 3) {
      pending = { id: crypto.randomUUID(), target, confidence: Math.min(...frames) };
      localStorage.setItem(storageKey + '-pending', JSON.stringify(pending));
    }
    if (pending && Date.now() >= saveAfter) {
      saveAfter = Date.now() + 3000;
      try {
        await saveAttempt();
        frames = [];
        saveAfter = 0;
      } catch {
        controls('Puntenopslag tijdelijk niet bereikbaar. We proberen opnieuw.');
      }
    }
  } catch (error) {
    stopScanning(error.message);
  } finally {
    if (watching && session === enrollment) timer = setTimeout(() => watch(session), 200);
  }
}

function startScanning() {
  clearTimeout(timer);
  watching = true;
  frames = [];
  lastVideoTime = -1;
  controls(preview ? 'Kies een voorspelling. De teststand scant automatisch.' :
    'Live herkenning actief. Hou je hand naast of onder je gezicht.');
  watch(++enrollment);
}

function stopScanning(message) {
  watching = false;
  enrollment++;
  clearTimeout(timer);
  closeCamera(video);
  cameraPreview.getContext('2d').clearRect(0, 0, cameraPreview.width, cameraPreview.height);
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  showRecognition('–', undefined, 'Zekerheid');
  controls(message);
}

async function refresh() {
  if (!device) initializeDevice();
  await score();
  controls(preview ? 'Kies een voorspelling om de live herkenning te testen.' : 'Start je camera om te spelen.');
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
  if (!target) await refresh();
  controls('Handfilter en camera laden…');
  [handFilter, model] = await Promise.all([
    handFilter ?? createHandFilter('VIDEO'),
    model ?? loadModel().catch(() => null),
  ]);
  if (!pageActive) return;
  await openCamera(video, 'user');
  if (pageActive) startScanning();
  else closeCamera(video);
}));
stop.addEventListener('click', () => {
  if (preview) {
    stopScanning('Teststand staat stil. Verander de testvoorspelling om te hervatten.');
    return;
  }
  stopScanning('Camera staat uit.');
});
byId('prediction').addEventListener('change', () => {
  if (preview && target && !watching) startScanning();
});
window.addEventListener('pagehide', () => {
  pageActive = false;
  stopScanning();
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
  run(async () => {
    await refresh();
    if (preview) startScanning();
  });
}
