import { handleScore } from './score.mjs';
import { assets } from './site-assets.mjs';

function scoreStore(db) {
  async function getWithMetadata(key) {
    const row = await db.prepare('SELECT payload, revision FROM scores WHERE device = ?').bind(key).first();
    return row ? { data: JSON.parse(row.payload), etag: row.revision } : null;
  }
  return {
    getWithMetadata,
    async get(key) { return (await getWithMetadata(key))?.data; },
    async setJSON(key, value, constraint) {
      const data = JSON.stringify(value);
      const result = constraint.onlyIfNew
        ? await db.prepare('INSERT OR IGNORE INTO scores (device, payload, revision) VALUES (?, ?, 1)').bind(key, data).run()
        : await db.prepare('UPDATE scores SET payload = ?, revision = revision + 1 WHERE device = ? AND revision = ?')
          .bind(data, key, constraint.onlyIfMatch).run();
      return { modified: result.meta.changes > 0 };
    },
  };
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/.netlify/functions/score') {
      try { return await handleScore(request, scoreStore(env.DB)); }
      catch { return Response.json({ error: 'Puntenopslag tijdelijk niet beschikbaar.' }, { status: 503 }); }
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
    const asset = assets[path === '/' ? '/index.html' : path];
    if (!asset) return new Response(null, { status: 404 });
    const [mime, base64] = asset;
    return new Response(request.method === 'HEAD' ? null : Uint8Array.from(atob(base64), value => value.charCodeAt(0)), {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'no-cache',
        'Permissions-Policy': 'camera=(self), microphone=()',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },
};
