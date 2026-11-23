import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { labels } from '../public/quest.mjs';

export const root = new URL('../../opruimquest/trainingdata/', import.meta.url);
const splits = ['training', 'test'];
const photos = /\.(jpe?g|png|webp)$/i;
const localFile = /^[a-z\d_-][a-z\d_.-]*\.(jpe?g|png|webp)$/i;
const trainingFolder = label => new URL('training/' + label + '/', root);

export async function trainingManifest() {
  const entries = await Promise.all(labels.map(async label => {
    const files = await readdir(trainingFolder(label), { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const names = files.filter(file => file.isFile() && localFile.test(file.name)).map(file => file.name).sort();
    return [label, names];
  }));
  return Object.fromEntries(entries);
}

export async function handleTrainingPhoto(request, response, origin) {
  if (request.method !== 'GET' || request.headers['x-handquest-local'] !== 'training') {
    response.writeHead(403).end();
    return;
  }
  const { searchParams } = new URL(request.url, origin);
  const label = searchParams.get('label');
  const filename = searchParams.get('file');
  if (!labels.includes(label) || !localFile.test(filename)) {
    response.writeHead(400).end();
    return;
  }
  const photo = await readFile(new URL(filename, trainingFolder(label)));
  const mime = filename.endsWith('.png') ? 'image/png' : filename.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  response.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' }).end(photo);
}

export async function handlePhotoReview(request, response, origin) {
  if (request.method !== 'POST' || request.headers.origin !== origin ||
      request.headers['x-handquest-local'] !== 'training' || request.headers['content-type'] !== 'application/json') {
    json(response, 403, { error: 'De fotocontrole werkt uitsluitend op je pc.' });
    return;
  }
  let body = '';
  for await (const part of request) {
    body += part;
    if (body.length > 100_000) {
      json(response, 413, { error: 'De fotocontrole is te groot.' });
      return;
    }
  }
  let photos;
  try { photos = JSON.parse(body); }
  catch { json(response, 400, { error: 'Ongeldige fotolijst.' }); return; }
  if (!Array.isArray(photos) || !photos.every(photo => labels.includes(photo?.label) &&
      typeof photo.file === 'string' && localFile.test(photo.file))) {
    json(response, 400, { error: 'Ongeldige fotolijst.' });
    return;
  }
  const archive = new URL('nakijken/handfilter-' + randomUUID() + '/', root);
  let moved = 0;
  for (const { label, file } of photos) {
    const destination = new URL(label + '/', archive);
    await mkdir(destination, { recursive: true });
    try {
      await rename(new URL(file, trainingFolder(label)), new URL(file, destination));
      moved++;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  json(response, 200, { moved, counts: await countPhotos() });
}

function countFiles(folder) {
  return readdir(folder, { withFileTypes: true }).then(
    files => files.filter(file => file.isFile() && photos.test(file.name)).length,
    error => {
      if (error.code === 'ENOENT') return 0;
      throw error;
    },
  );
}

async function countPhotos() {
  const groups = await Promise.all(splits.map(async split => [split, Object.fromEntries(
    await Promise.all(labels.map(async label => [label, await countFiles(new URL(split + '/' + label + '/', root))])),
  )]));
  return Object.fromEntries(groups);
}

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

export async function handleDataset(request, response, origin) {
  if (request.method === 'GET') {
    json(response, 200, { counts: await countPhotos() });
    return;
  }
  if (request.method !== 'POST') {
    json(response, 405, { error: 'Methode niet toegestaan.' });
    return;
  }
  if (request.headers.origin !== origin || request.headers['content-type'] !== 'image/jpeg') {
    json(response, 403, { error: 'Open de fotostand via 127.0.0.1 op je eigen pc.' });
    return;
  }
  const { searchParams } = new URL(request.url, origin);
  const split = searchParams.get('split');
  const label = searchParams.get('label');
  if (!splits.includes(split) || !labels.includes(label)) {
    json(response, 400, { error: 'Onbekende fotoset of klasse.' });
    return;
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 512_000) {
      json(response, 413, { error: 'De foto is te groot.' });
      return;
    }
    chunks.push(chunk);
  }
  const photo = Buffer.concat(chunks);
  if (photo.length < 4 || photo[0] !== 0xff || photo[1] !== 0xd8 ||
      photo.at(-2) !== 0xff || photo.at(-1) !== 0xd9) {
    json(response, 400, { error: 'Er is geen geldige JPEG ontvangen.' });
    return;
  }
  const folder = new URL(split + '/' + label + '/', root);
  const filename = label.toLowerCase() + '-' + Date.now() + '-' + randomUUID().slice(0, 8) + '.jpg';
  await mkdir(folder, { recursive: true });
  await writeFile(new URL(filename, folder), photo, { flag: 'wx' });
  json(response, 201, { filename, counts: await countPhotos() });
}
