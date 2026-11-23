import { captureSquare, closeCamera, openCamera } from './camera.mjs';
import { labels } from './quest.mjs';

const folders = ['Peace', 'Middelvinger', 'Geen gebaar'];
const get = id => document.getElementById(id);
const video = get('camera');
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 448;
const counts = [0, 0, 0];
let directories;
let latest;
let active = true;

function updateCounts() {
  const items = labels.map((name, index) => {
    const entry = document.createElement('li');
    entry.textContent = name + ' · ' + counts[index] + ' / 30';
    return entry;
  });
  get('counts').replaceChildren(...items);
}

function message(text) { get('status').textContent = text; }
function updateCamera() {
  get('placeholder').hidden = !video.hidden;
  get('camera-button').textContent = video.hidden ? 'Start webcam' : 'Zet webcam uit';
  get('capture').disabled = video.hidden;
}

get('folder').hidden = !window.showDirectoryPicker;
get('folder').addEventListener('click', async () => {
  get('folder').disabled = true;
  get('capture').disabled = true;
  try {
    const root = await window.showDirectoryPicker({ mode: 'readwrite', id: 'handgebaarquest-dataset' });
    const selected = await Promise.all(folders.map(name => root.getDirectoryHandle(name, { create: true })));
    const totals = await Promise.all(selected.map(async directory => {
      let count = 0;
      for await (const entry of directory.values()) {
        if (entry.kind === 'file' && /\.(jpe?g|png|webp)$/i.test(entry.name)) count++;
      }
      return count;
    }));
    directories = selected;
    counts.splice(0, counts.length, ...totals);
    get('storage').textContent = 'Opslagmap: ' + root.name + '. Foto’s worden per klasse opgeslagen.';
    updateCounts();
    message('Opslagmap klaar. Je kunt nu foto’s maken.');
  } catch (error) {
    if (error.name !== 'AbortError') message('Kan die map niet gebruiken. Kies een eigen submap of download elke foto apart.');
  } finally {
    get('folder').disabled = false;
    updateCamera();
  }
});

get('camera-button').addEventListener('click', async () => {
  get('camera-button').disabled = true;
  try {
    if (video.hidden) await openCamera(video, 'user');
    else closeCamera(video);
    if (!active) closeCamera(video);
    message(video.hidden ? 'Webcam staat uit.' : 'Zet je hele hand in het midden en klik op Maak foto.');
  } catch (error) {
    message(error.message);
  } finally {
    updateCamera();
    get('camera-button').disabled = false;
  }
});

get('capture').addEventListener('click', async () => {
  get('capture').disabled = true;
  get('folder').disabled = true;
  try {
    const index = Number(get('label').value);
    captureSquare(video, canvas);
    const photo = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!photo) throw new Error('Het beeld kon niet worden opgeslagen.');
    const filename = folders[index].toLowerCase().replaceAll(' ', '-') + '-' + Date.now() + '.jpg';
    const url = URL.createObjectURL(photo);
    if (latest) URL.revokeObjectURL(latest);
    latest = url;
    get('recent').src = url;
    get('recent').hidden = false;
    if (directories) {
      const file = await directories[index].getFileHandle(filename, { create: true });
      const stream = await file.createWritable();
      await stream.write(photo);
      await stream.close();
    } else {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
    }
    counts[index]++;
    updateCounts();
    message((directories ? 'Opgeslagen: ' : 'Download aangevraagd: ') + filename);
  } catch (error) {
    message(error.message || 'Opslaan is niet gelukt. Probeer opnieuw.');
  } finally {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    get('folder').disabled = false;
    updateCamera();
  }
});

window.addEventListener('pagehide', () => {
  active = false;
  closeCamera(video);
  updateCamera();
});
window.addEventListener('pageshow', () => { active = true; });
updateCounts();
