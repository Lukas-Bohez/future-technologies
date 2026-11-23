import { captureSquare, closeCamera, openCamera } from './camera.mjs';
import { hints, labels } from './quest.mjs';

const get = id => document.getElementById(id);
const video = get('camera');
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 448;
let latest;
let active = true;
let ready = false;
let busy = false;

function message(text) { get('status').textContent = text; }
function updateCamera() {
  get('placeholder').hidden = !video.hidden;
  get('camera-button').textContent = video.hidden ? 'Start webcam' : 'Zet webcam uit';
  get('camera-button').disabled = !ready || busy;
  get('capture').disabled = !ready || busy || video.hidden;
  get('label').disabled = busy;
  get('split').disabled = busy;
}

function updateCounts(counts) {
  const entries = labels.map(name => {
    const item = document.createElement('li');
    item.textContent = name + ' · training ' + counts.training[name] + '/30 · test ' + counts.test[name] + '/10';
    return item;
  });
  get('counts').replaceChildren(...entries);
}

async function api(query = '', photo) {
  const response = await fetch('/api/dataset' + query, {
    method: photo ? 'POST' : 'GET',
    headers: photo ? { 'Content-Type': 'image/jpeg' } : undefined,
    body: photo,
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'De lokale opslag reageert niet.');
  return data;
}

get('label').addEventListener('change', () => { get('hint').textContent = hints[get('label').value]; });
get('hint').textContent = hints.V;

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
    captureSquare(video, canvas);
    const photo = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!photo) throw new Error('Het beeld kon niet worden opgeslagen.');
    const result = await api('?' + new URLSearchParams({ split, label }), photo);
    if (latest) URL.revokeObjectURL(latest);
    latest = URL.createObjectURL(photo);
    get('recent').src = latest;
    get('recent').hidden = false;
    updateCounts(result.counts);
    message('Opgeslagen in dataset/' + split + '/' + label + ': ' + result.filename);
  } catch (error) {
    message(error.message || 'Opslaan is niet gelukt. Probeer opnieuw.');
  } finally {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    busy = false;
    updateCamera();
  }
});

window.addEventListener('pagehide', () => {
  active = false;
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
