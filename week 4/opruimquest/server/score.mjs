import { THRESHOLD } from '../public/quest.mjs';

const pointsPerRound = 10;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function handleScore(request, store) {
  const device = request.headers.get('X-Quest-Device');
  if (!uuid.test(device)) return json({ error: 'Ongeldige toestelcode.' }, 400);
  if (request.method === 'GET') {
    const rounds = await store.get(device, { type: 'json' });
    return json({ points: (rounds?.length ?? 0) * pointsPerRound });
  }
  if (request.method !== 'POST') return json({ error: 'Methode niet toegestaan.' }, 405);

  const payload = await request.json().catch(() => null);
  if (typeof payload?.id !== 'string' || !uuid.test(payload.id) ||
      ![payload.before, payload.after].every(value => Number.isFinite(value) && value >= THRESHOLD && value <= 1)) {
    return json({ error: 'Ongeldige ronde.' }, 400);
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const existing = await store.getWithMetadata(device, { type: 'json' });
    const rounds = existing?.data ?? [];
    if (rounds.includes(payload.id)) return json({ points: rounds.length * pointsPerRound });
    const updated = [...rounds, payload.id];
    const condition = existing ? { onlyIfMatch: existing.etag } : { onlyIfNew: true };
    const written = await store.setJSON(device, updated, condition);
    if (written.modified) return json({ points: updated.length * pointsPerRound });
  }
  return json({ error: 'Probeer de score opnieuw op te slaan.' }, 409);
}
