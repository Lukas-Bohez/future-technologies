import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { trainingManifest, root } from './dataset.mjs';
import { labels, TRAINING_MINIMUM } from '../public/quest.mjs';

const pointer = new URL('model/current.txt', root);
const exportFolder = id => new URL('model/' + id + '/', root);
const modelFiles = ['model.json', 'metadata.json', 'weights.bin'];

export async function trainedAsset(file) {
  if (!modelFiles.includes(file)) return;
  try {
    const id = await readFile(pointer, 'utf8');
    if (/^[\da-f-]{36}$/.test(id)) return await readFile(new URL(file, exportFolder(id)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function json(response, code, body) {
  response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    .end(JSON.stringify(body));
}

export async function handleTraining(request, response, origin) {
  if (request.headers['x-handquest-local'] !== 'training') {
    json(response, 403, { error: 'Deze functie werkt in de lokale trainingsstand.' });
    return;
  }
  if (request.method === 'GET') {
    json(response, 200, { files: await trainingManifest() });
    return;
  }
  if (request.method !== 'POST' || request.headers.origin !== origin ||
      request.headers['content-type'] !== 'application/json') {
    json(response, 403, { error: 'De export kan alleen lokaal worden opgeslagen.' });
    return;
  }
  const files = await trainingManifest();
  if (!labels.every(label => files[label].length >= TRAINING_MINIMUM)) {
    json(response, 409, { error: 'Verzamel eerst genoeg trainingsbeelden per klasse.' });
    return;
  }
  const parts = [];
  let size = 0;
  for await (const part of request) {
    size += part.length;
    if (size > 24_000_000) {
      json(response, 413, { error: 'Het modelbestand is te groot.' });
      return;
    }
    parts.push(part);
  }
  let payload;
  try { payload = JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { json(response, 400, { error: 'Ongeldige modelexport.' }); return; }
  if (!payload?.topology || !Array.isArray(payload.specs) ||
      !Array.isArray(payload.metadata?.labels) || payload.metadata.labels.join('|') !== labels.join('|') ||
      typeof payload.weights !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(payload.weights)) {
    json(response, 400, { error: 'Modelbestanden of klasselabels zijn onvolledig.' });
    return;
  }
  const id = randomUUID();
  const directory = exportFolder(id);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(new URL('model.json', directory), JSON.stringify({
      format: 'layers-model', modelTopology: payload.topology,
      weightsManifest: [{ paths: ['weights.bin'], weights: payload.specs }],
    })),
    writeFile(new URL('metadata.json', directory), JSON.stringify(payload.metadata)),
    writeFile(new URL('weights.bin', directory), Buffer.from(payload.weights, 'base64')),
  ]);
  const next = new URL('model/' + id + '.tmp', root);
  await writeFile(next, id, { flag: 'wx' });
  await rename(next, pointer);
  json(response, 201, { folder: 'trainingdata/model/' + id });
}
