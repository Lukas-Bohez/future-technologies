import { getStore } from '@netlify/blobs';
import { handleScore } from '../../server/score.mjs';

export default async function score(request) {
  try {
    return await handleScore(request, getStore({ name: 'opruimquest-scores', consistency: 'strong' }));
  } catch (error) {
    console.error('Scoreopslag mislukt', error.name);
    return Response.json({ error: 'Puntenopslag tijdelijk niet beschikbaar.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
