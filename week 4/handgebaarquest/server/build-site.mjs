import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const destination = new URL('dist/server/', root);
const webFiles = {
  'index.html': 'text/html; charset=utf-8',
  'style.css': 'text/css; charset=utf-8',
  'app.mjs': 'text/javascript; charset=utf-8',
  'camera.mjs': 'text/javascript; charset=utf-8',
  'quest.mjs': 'text/javascript; charset=utf-8',
  'hands.mjs': 'text/javascript; charset=utf-8',
  'model.mjs': 'text/javascript; charset=utf-8',
  'model/model.json': 'application/json',
  'model/metadata.json': 'application/json',
  'model/weights.bin': 'application/octet-stream',
};
const encoded = Object.fromEntries(await Promise.all(Object.entries(webFiles).map(async ([path, mime]) => [
  '/' + path, [mime, (await readFile(new URL('public/' + path, root))).toString('base64')],
])));
await mkdir(destination, { recursive: true });
const [quest, score, worker] = await Promise.all([
  readFile(new URL('public/quest.mjs', root), 'utf8'),
  readFile(new URL('server/score.mjs', root), 'utf8'),
  readFile(new URL('server/site-worker.mjs', root), 'utf8'),
]);
const withoutImports = source => source.split('\n').filter(line => !line.startsWith('import ')).join('\n');
await writeFile(new URL('index.js', destination),
  'const assets = Object.assign(Object.create(null), ' + JSON.stringify(encoded) + ');\n' +
  quest + '\n' + withoutImports(score) + '\n' + withoutImports(worker));
