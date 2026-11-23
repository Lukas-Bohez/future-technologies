import { closeCamera, openCamera } from './camera.mjs';
import { hints, labels, TRAINING_MINIMUM } from './quest.mjs';
import { readTrainingPhotos, trainLocal } from './trainer.mjs';
import { createHandFilter, rankShapes } from './hands.mjs';

const get = id => document.getElementById(id);
const video = get('camera');
const canvas = get('capture-preview');
let latest;
let active = true;
let ready = false;
let busy = false;
let automatic;
let counts;
let filter;
let previewTimer;
const examples = { V: '645 215 79 105', O: '375 340 80 90', L: '123 320 80 103' };

function message(text) { get('status').textContent = text; }
function updateCamera() {
  get('placeholder').hidden = !video.hidden;
  get('camera-button').textContent = video.hidden ? 'Start webcam' : 'Zet webcam uit';
  get('camera-button').disabled = !ready || busy;
  get('capture').disabled = !ready || busy || video.hidden;
  get('audit').disabled = !ready || busy;
  get('label').disabled = busy;
  get('split').disabled = busy;
  get('auto-start').disabled = !ready || busy;
  get('auto-stop').hidden = !automatic;
  canvas.hidden = video.hidden;
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
  if (video.readyState < 2) throw new Error('Wacht tot je hand in beeld komt.');
  const result = filter.crop(video, canvas, performance.now());
  if (result.status !== 'hand') {
    const guidance = result.status === 'face' ? 'Zet je hand naast of onder je gezicht.' : 'Hou je hele hand dichter bij de webcam.';
    return { guidance };
  }
  const clearOtherLetter = rankShapes(result.points).find(item =>
    item.className !== 'Overig' && item.className !== label && item.probability >= 0.90);
  if (clearOtherLetter) return { guidance: 'Dit lijkt duidelijk op ' + clearOtherLetter.className + '. Volg het voorbeeld voor ' + label + '.' };
  const photo = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!photo) throw new Error('Het beeld kon niet worden opgeslagen.');
  const saved = await api('?' + new URLSearchParams({ split, label }), photo, signal);
  if (latest) URL.revokeObjectURL(latest);
  latest = URL.createObjectURL(photo);
  get('recent').src = latest;
  get('recent').hidden = false;
  updateCounts(saved.counts);
  return { filename: saved.filename };
}

async function startCamera() {
  filter ??= await createHandFilter('VIDEO');
  if (!active || automatic?.signal.aborted) return;
  await openCamera(video, 'user');
  if (!active || automatic?.signal.aborted) {
    closeCamera(video);
    return;
  }
  clearInterval(previewTimer);
  previewTimer = setInterval(() => {
    if (!video.hidden && video.readyState >= 2) filter.crop(video, canvas, performance.now());
  }, 240);
}

function stopCamera() {
  clearInterval(previewTimer);
  closeCamera(video);
}

get('camera-button').addEventListener('click', async () => {
  busy = true;
  updateCamera();
  try {
    if (video.hidden) await startCamera();
    else stopCamera();
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
    const result = await savePhoto(split, label);
    message(result.filename ? 'Opgeslagen in trainingdata/' + split + '/' + label + ': ' + result.filename : result.guidance);
  } catch (error) {
    message(error.message || 'Opslaan is niet gelukt. Probeer opnieuw.');
  } finally {
    busy = false;
    updateCamera();
  }
});

get('audit').addEventListener('click', async () => {
  busy = true;
  updateCamera();
  let audit;
  try {
    message('Hand- en gezichtsfilter laden…');
    audit = await createHandFilter();
    const output = document.createElement('canvas');
    output.width = output.height = 224;
    const excluded = [];
    const retained = Object.fromEntries(labels.map(label => [label, { total: 0, matches: 0 }]));
    await readTrainingPhotos(({ label, file, position, count, image }) => {
      message('Foto’s controleren · ' + label + ' ' + (position + 1) + '/' + count);
      const result = audit.crop(image, output);
      if (result.status !== 'hand') {
        excluded.push({ label, file });
        return;
      }
      const top = rankShapes(result.points).reduce((a, b) => a.probability > b.probability ? a : b);
      retained[label].total++;
      if (top.className === label) retained[label].matches++;
    });
    const response = await fetch('/api/training/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Handquest-Local': 'training' },
      body: JSON.stringify(excluded),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    updateCounts(result.counts);
    message(result.moved + ' foto’s verplaatst naar trainingdata/nakijken. Handvormcontrole op behouden trainingsfoto’s: ' +
      labels.map(label => label + ' ' + retained[label].matches + '/' + retained[label].total).join(' · ') + '.');
  } catch (error) {
    message('Fotocontrole kon niet afronden. ' + error.message);
  } finally {
    audit?.close();
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
      if (video.hidden) await startCamera();
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
            if (label === 'Overig') message('Overig · toon een vuist, open hand of ander gebaar. Opname over ' + seconds + ' s.');
            await wait(1000, signal);
          }
          for (let photo = 0; photo < batch;) {
            signal.throwIfAborted();
            message(label + ' · foto ' + (photo + 1) + '/' + batch + '. Wissel lichtjes van hoek of afstand.');
            const result = await savePhoto('training', label, signal);
            if (result.filename) photo++;
            else message(label + ' · ' + result.guidance);
            if (photo < batch) await wait(950, signal);
          }
        }
      }
    }
    stopCamera();
    updateCamera();
    const folder = await trainLocal(message, signal);
    message('Training klaar. Open het spel om je model te testen. Export: opruimquest/' + folder + '.');
  } catch (error) {
    message(signal.aborted ? 'Gestopt. Eerder opgeslagen foto’s blijven bewaard.' : error.message);
  } finally {
    stopCamera();
    automatic = undefined;
    busy = false;
    updateCamera();
  }
});
get('auto-stop').addEventListener('click', () => {
  automatic?.abort();
  stopCamera();
  message('Stoppen…');
  updateCamera();
});

window.addEventListener('pagehide', () => {
  active = false;
  automatic?.abort();
  stopCamera();
  updateCamera();
});
window.addEventListener('pageshow', () => { active = true; });
api().then(result => {
  updateCounts(result.counts);
  ready = true;
  message('Kies training of test, selecteer een letter en start de webcam.');
  updateCamera();
}).catch(() => message('Open de fotostand via http://127.0.0.1:4174/dataset.html met de lokale server aan.'));
