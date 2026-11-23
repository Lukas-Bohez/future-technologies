import { THRESHOLD, targetFor, targets } from '../public/quest.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const response = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const scoreboard = rounds => ({ points: rounds.length * 10, target: targetFor(rounds.length) });

export async function handleScore(request, store) {
  const device = request.headers.get('X-Quest-Device');
  if (!uuid.test(device)) return response({ error: 'Ongeldige toestelcode.' }, 400);
  if (request.method === 'GET') return response(scoreboard(await store.get(device, { type: 'json' }) ?? []));
  if (request.method !== 'POST') return response({ error: 'Methode niet toegestaan.' }, 405);

  const attempt = await request.json().catch(() => null);
  if (typeof attempt?.id !== 'string' || !uuid.test(attempt.id) || !targets.includes(attempt.target) ||
      !Number.isFinite(attempt.confidence) || attempt.confidence < THRESHOLD || attempt.confidence > 1) {
    return response({ error: 'Ongeldige ronde.' }, 400);
  }
  for (let retry = 0; retry < 4; retry++) {
    const current = await store.getWithMetadata(device, { type: 'json' });
    const rounds = current?.data ?? [];
    if (rounds.includes(attempt.id)) return response(scoreboard(rounds));
    if (attempt.target !== targetFor(rounds.length)) return response(scoreboard(rounds), 409);
    const updated = [...rounds, attempt.id];
    const options = current ? { onlyIfMatch: current.etag } : { onlyIfNew: true };
    if ((await store.setJSON(device, updated, options)).modified) return response(scoreboard(updated));
  }
  return response({ error: 'Probeer de score opnieuw op te slaan.' }, 503);
}
