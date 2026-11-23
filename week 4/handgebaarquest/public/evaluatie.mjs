import { labels, THRESHOLD } from './quest.mjs';
import { loadModel } from './model.mjs';

const get = id => document.getElementById(id);
const conditions = [
  { name: 'Origineel', filter: 'none' },
  { name: 'Donkerder', filter: 'brightness(0.65)' },
  { name: 'Lichter', filter: 'brightness(1.3)' },
];
const canvas = document.createElement('canvas');
canvas.width = canvas.height = 224;
const ctx = canvas.getContext('2d');
let report = [];

function selectedFiles() {
  return [...get('images').files].flatMap(file => {
    const path = file.webkitRelativePath.split('/');
    const label = path.at(-2);
    return path[0].toLowerCase() === 'test' && labels.includes(label) && /\.(jpe?g|png|webp)$/i.test(file.name)
      ? [{ file, label }] : [];
  });
}

function render(rows) {
  const table = document.createElement('table');
  table.className = 'evidence';
  const headers = table.createTHead().insertRow();
  for (const name of ['Klasse', ...conditions.map(condition => condition.name)]) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = name;
    headers.append(cell);
  }
  const body = table.createTBody();
  for (const label of [...labels, 'Totaal']) {
    const row = body.insertRow();
    const title = document.createElement('th');
    title.scope = 'row';
    title.textContent = label;
    row.append(title);
    for (const condition of conditions) {
      const scores = rows.filter(item => (item.expected === label || label === 'Totaal') && item.condition === condition.name);
      row.insertCell().textContent = scores.filter(item => item.prediction === item.expected).length + '/' + scores.length;
    }
  }
  get('results').replaceChildren(table);
}

get('images').addEventListener('change', () => {
  const files = selectedFiles();
  get('evaluate').disabled = !files.length;
  get('report').hidden = true;
  get('results').replaceChildren();
  get('status').textContent = files.length ? files.length + ' testfoto’s gevonden.' : 'Kies de map dataset/test met submappen V, O, L en Overig.';
});

get('evaluate').addEventListener('click', async () => {
  const files = selectedFiles();
  get('evaluate').disabled = true;
  get('images').disabled = true;
  get('report').hidden = true;
  get('status').textContent = 'Model laden…';
  try {
    const model = await loadModel();
    const results = [];
    for (const [index, item] of files.entries()) {
      get('status').textContent = 'Foto ' + (index + 1) + ' van ' + files.length + ' testen…';
      const image = await createImageBitmap(item.file);
      try {
        const crop = Math.min(image.width, image.height);
        for (const condition of conditions) {
          ctx.filter = condition.filter;
          ctx.drawImage(image, (image.width - crop) / 2, (image.height - crop) / 2, crop, crop, 0, 0, canvas.width, canvas.height);
          const top = (await model.predict(canvas)).reduce((best, score) => score.probability > best.probability ? score : best);
          const prediction = labels.find(label => label.toLowerCase() === top.className.trim().toLowerCase());
          results.push({
            file: item.file.name, expected: item.label, condition: condition.name,
            prediction: top.probability >= THRESHOLD ? prediction : 'Onzeker', confidence: top.probability,
          });
        }
      } finally {
        image.close();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    report = results;
    render(report);
    get('report').hidden = false;
    get('status').textContent = 'Test voltooid. Gebruik Origineel voor je eigen testresultaat. Donkerder en Lichter zijn afgeleide stresstests.';
  } catch (error) {
    get('status').textContent = error.message;
  } finally {
    get('images').disabled = false;
    get('evaluate').disabled = false;
  }
});

get('report').addEventListener('click', () => {
  const escape = value => '"' + String(value).replaceAll('"', '""').replace(/^[=+@-]/, "'$&") + '"';
  const lines = ['bestand,verwacht,conditie,voorspeld,zekerheid', ...report.map(row => Object.values(row).map(escape).join(','))];
  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const download = document.createElement('a');
  download.href = url;
  download.download = 'handgebaarquest-testresultaten.csv';
  download.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
