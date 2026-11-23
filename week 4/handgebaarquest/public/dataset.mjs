import { captureSquare, closeCamera, openCamera } from './camera.mjs';
import { hints, labels, TRAINING_MINIMUM } from './quest.mjs';
import { trainLocal } from './trainer.mjs';

const get = id => document.getElementById(id);
const video = get('camera');
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 448;
let latest;
let active = true;
let ready = false;
let busy = false;
let automatic;
let counts;
const examples = { V: '645 215 79 105', O: '375 340 80 90', L: '123 320 80 103' };

function message(text) { get('status').textContent = text; }
function updateCamera() {
  get('placeholder').hidden = !video.hidden;
  get('camera-button').textContent = video.hidden ? 'Start webcam' : 'Zet webcam uit';
  get('camera-button').disabled = !ready || busy;
  get('capture').disabled = !ready || busy || video.hidden;
  get('label').disabled = busy;
  get('split').disabled = busy;
  get('auto-start').disabled = !ready || busy;
  get('auto-stop').hidden = !automatic;
}

function updateCounts(value) {
  counts = value;
  const entries = labels.map(name => {
    const item = document.createElement('li');
    item.textContent = name + ' · training ' + counts.training[name] + '/' + TRAINING_MINIMUM + ' · test ' + counts.test[name] + '/10';
    return item;
  });
  get('counts').replaceChildren(...entries);
}

async function api(query = '', photo, signal) {
  const response = await fetch('/api/dataset' + query, {
    method: photo ? 'POST' : 'GET',
    headers: photo ? { 'Content-Type': 'image/jpeg' } : undefined,
    body: photo,
    cache: 'no-store',
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'De lokale opslag reageert niet.');
  return data;
}

function showExample() {
  const label = get('label').value;
  const drawing = get('example');
  drawing.hidden = !examples[label];
  if (examples[label]) drawing.setAttribute('viewBox', examples[label]);
  drawing.setAttribute('aria-label', 'Handvorm ' + label);
  get('hint').textContent = hints[label];
}

get('label').addEventListener('change', showExample);
showExample();

async function savePhoto(split, label, signal) {
  captureSquare(video, canvas);
  try {
    const photo = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!photo) throw new Error('Het beeld kon niet worden opgeslagen.');
    const result = await api('?' + new URLSearchParams({ split, label }), photo, signal);
    if (latest) URL.revokeObjectURL(latest);
    latest = URL.createObjectURL(photo);
    get('recent').src = latest;
    get('recent').hidden = false;
    updateCounts(result.counts);
    return result.filename;
  } finally {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }
}

get('camera-button').addEventListener('click', async () => {
  busy = true;
  updateCamera();
  try {
    if (video.hidden) await openCamera(video, 'user');
    else closeCamera(video);
    if (!active) closeCamera(video);
    message(video.hidden ? 'Webcam staat uit.' : 'Hou je hele hand in het beeld en klik op Maak foto.');
  } catch (error) {
    message(error.message);
  } finally {
    busy = false;
    updateCamera();
  }
});

get('capture').addEventListener('click', async () => {
  busy = true;
  updateCamera();
  try {
    const split = get('split').value;
    const label = get('label').value;
    const filename = await savePhoto(split, label);
    message('Opgeslagen in trainingdata/' + split + '/' + label + ': ' + filename);
  } catch (error) {
    message(error.message || 'Opslaan is niet gelukt. Probeer opnieuw.');
  } finally {
    busy = false;
    updateCamera();
  }
});

async function wait(milliseconds, signal) {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
  signal.throwIfAborted();
}

get('auto-start').addEventListener('click', async () => {
  automatic = new AbortController();
  const { signal } = automatic;
  busy = true;
  updateCamera();
  try {
    updateCounts((await api('', undefined, signal)).counts);
    if (labels.some(label => counts.training[label] < TRAINING_MINIMUM)) {
      message('Webcam openen voor de automatische fotosessie…');
      if (video.hidden) await openCamera(video, 'user');
      signal.throwIfAborted();
      updateCamera();
      get('split').value = 'training';
      while (labels.some(label => counts.training[label] < TRAINING_MINIMUM)) {
        for (const label of labels) {
          const batch = Math.min(5, TRAINING_MINIMUM - counts.training[label]);
          if (batch <= 0) continue;
          get('label').value = label;
          showExample();
          for (let seconds = 5; seconds > 0; seconds--) {
            message(label + ' · maak de afgebeelde handvorm. Opname over ' + seconds + ' s.');
            if (label === 'Overig') message('Overig · toon een lege achtergrond, losse hand of ander gebaar. Opname over ' + seconds + ' s.');
            await wait(1000, signal);
          }
          for (let photo = 0; photo < batch; photo++) {
            signal.throwIfAborted();
            message(label + ' · foto ' + (photo + 1) + '/' + batch + '. Wissel lichtjes van hoek of afstand.');
            await savePhoto('training', label, signal);
            if (photo + 1 < batch) await wait(950, signal);
          }
        }
      }
    }
    closeCamera(video);
    updateCamera();
    const folder = await trainLocal(message, signal);
    message('Training klaar. Open het spel om je model te testen. Export: opruimquest/' + folder + '.');
  } catch (error) {
    message(signal.aborted ? 'Gestopt. Eerder opgeslagen foto’s blijven bewaard.' : error.message);
  } finally {
    closeCamera(video);
    automatic = undefined;
    busy = false;
    updateCamera();
  }
});
get('auto-stop').addEventListener('click', () => {
  automatic?.abort();
  closeCamera(video);
  message('Stoppen…');
  updateCamera();
});

window.addEventListener('pagehide', () => {
  active = false;
  automatic?.abort();
  closeCamera(video);
  updateCamera();
});
window.addEventListener('pageshow', () => { active = true; });
api().then(result => {
  updateCounts(result.counts);
  ready = true;
  message('Kies training of test, selecteer een letter en start de webcam.');
  updateCamera();
}).catch(() => message('Open de fotostand via http://127.0.0.1:4174/dataset.html met de lokale server aan.'));
