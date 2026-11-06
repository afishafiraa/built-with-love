import { timingSafeEqual } from 'node:crypto';
import { callBackend, sendBackendError } from '../server/data.js';
import { ApiRequest, ApiResponse, header, send } from '../server/http.js';

export const maxDuration = 15;

function matchesSecret(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length
    && timingSafeEqual(providedBuffer, expectedBuffer);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'Method not allowed.' });
  }

  const expectedSecrets = [process.env.CRON_SECRET, process.env.KEEPALIVE_SECRET]
    .map(value => value?.trim() || '')
    .filter(value => value.length >= 32);
  if (expectedSecrets.length === 0) {
    return send(res, 503, { error: 'Keep-alive is not configured.' });
  }

  const authorization = header(req, 'authorization');
  const providedSecret = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';

  if (!providedSecret || !expectedSecrets.some(secret => matchesSecret(providedSecret, secret))) {
    return send(res, 401, { error: 'Unauthorized.' });
  }

  try {
    const config = await callBackend('getConfig');
    if (!config) return send(res, 503, { error: 'Published invitation config is missing.' });
    return send(res, 200, { ok: true, checkedAt: new Date().toISOString() });
  } catch (error) {
    return sendBackendError(res, error);
  }
}
