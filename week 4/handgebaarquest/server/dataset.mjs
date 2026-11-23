import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { labels } from '../public/quest.mjs';

const root = new URL('../dataset/', import.meta.url);
const splits = ['training', 'test'];
const photos = /\.(jpe?g|png|webp)$/i;

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
