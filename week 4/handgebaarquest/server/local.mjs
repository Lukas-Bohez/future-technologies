import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { handleScore } from './score.mjs';
import { handleDataset } from './dataset.mjs';

const origin = 'http://127.0.0.1:4174';
const publicDir = new URL('../public/', import.meta.url);
const dataDir = new URL('../.local/', import.meta.url);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
};

function readRecord(key) {
  try {
    const raw = readFileSync(new URL(key + '.json', dataDir), 'utf8');
    return { data: JSON.parse(raw), etag: createHash('sha256').update(raw).digest('hex') };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

const store = {
  get: key => readRecord(key)?.data ?? null,
  getWithMetadata: readRecord,
  setJSON(key, value, condition) {
    const current = readRecord(key);
    if (condition.onlyIfNew ? current : current?.etag !== condition.onlyIfMatch) return { modified: false };
    mkdirSync(dataDir, { recursive: true });
    const staged = new URL(key + '.tmp', dataDir);
    writeFileSync(staged, JSON.stringify(value));
    renameSync(staged, new URL(key + '.json', dataDir));
    return { modified: true };
  },
};

createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Permissions-Policy', 'camera=(self), microphone=()');
  try {
    const path = new URL(request.url, origin).pathname;
    if (path === '/api/dataset') {
      await handleDataset(request, response, origin);
      return;
    }
    if (path === '/.netlify/functions/score') {
      const headers = { 'X-Quest-Device': request.headers['x-quest-device'] ?? '' };
      let body;
      if (request.method === 'POST') {
        body = '';
        for await (const chunk of request) {
          body += chunk.toString();
          if (body.length > 4096) {
            response.writeHead(413).end();
            return;
          }
        }
      }
      const result = await handleScore(new Request(origin + path, { method: request.method, headers, body }), store);
      response.writeHead(result.status, Object.fromEntries(result.headers)).end(Buffer.from(await result.arrayBuffer()));
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }
    const filename = path === '/' ? 'index.html' : path.slice(1);
    const knownAsset = /^(index\.html|dataset\.html|evaluatie\.html|style\.css|app\.mjs|quest\.mjs|camera\.mjs|dataset\.mjs|evaluatie\.mjs|model\.mjs|handalfabet\.png)$/.test(filename);
    const modelAsset = /^model\/[a-z\d_-][a-z\d_.-]*\.(json|bin)$/i.test(filename);
    if (!knownAsset && !modelAsset) {
      response.writeHead(404).end();
      return;
    }
    const content = await readFile(new URL(filename, publicDir));
    response.writeHead(200, { 'Content-Type': contentTypes[extname(filename).toLowerCase()] });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 500).end();
  }
}).listen(4174, '127.0.0.1', () => {
  console.log('Met je eigen model: ' + origin);
  console.log('Teststand: ' + origin + '/?preview=1');
  console.log('Trainingsfoto’s: ' + origin + '/dataset.html');
}).on('error', error => {
  if (error.code === 'EADDRINUSE') console.error('Poort 4174 is al in gebruik. Probeer ' + origin + ' in je browser.');
  else console.error(error.message);
  process.exitCode = 1;
});
