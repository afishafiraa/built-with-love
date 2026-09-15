import { ApiResponse, send } from './http.js';

export function backendConfigured() {
  return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(process.env.SHEETS_ENDPOINT || '')
    && !!process.env.SHEETS_TOKEN;
}

export async function callAppsScript(action: string, payload: Record<string, unknown> = {}) {
  const endpoint = process.env.SHEETS_ENDPOINT || '';
  const token = process.env.SHEETS_TOKEN || '';
  if (!backendConfigured()) throw new Error('backend_not_configured');

  // The browser already owns retry/outbox behaviour. Retrying again here made
  // one slow bootstrap expand to roughly a minute (3 client × 3 proxy tries).
  const attempts = 1;
  let lastError = 'backend_unavailable';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutMs = action === 'bootstrap' ? 7_000
      : ['getConfig', 'getGuest', 'listWishes'].includes(action) ? 9_000
      : action === 'dashboardData' ? 12_000
      : 15_000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, token, ...payload }),
        redirect: 'follow',
        signal: controller.signal
      });
      const text = await response.text();
      if (!response.ok) {
        lastError = `backend_http_${response.status}`;
      } else {
        let json: Record<string, unknown>;
        try { json = JSON.parse(text) as Record<string, unknown>; }
        catch { throw new Error('backend_invalid_response'); }
        if (json.error) throw new Error(String(json.error));
        if (!Object.prototype.hasOwnProperty.call(json, 'data')) throw new Error('backend_invalid_response');
        return json.data;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'backend_unavailable';
      if (['unauthorized', 'backend_not_configured'].includes(lastError)) break;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 250 * attempt));
  }
  throw new Error(lastError);
}

export function sendBackendError(res: ApiResponse, error: unknown) {
  const message = error instanceof Error ? error.message : 'backend_unavailable';
  if (message === 'backend_not_configured') {
    send(res, 503, { error: 'Backend belum dikonfigurasi di Vercel.' });
    return;
  }
  if (message === 'unauthorized') {
    send(res, 502, { error: 'Koneksi backend ditolak. Periksa SHEETS_TOKEN di server.' });
    return;
  }
  if (/required|invalid|not found|too large|not an image/i.test(message)) {
    send(res, 400, { error: message });
    return;
  }
  send(res, 502, { error: 'Backend sementara tidak dapat dihubungi.' });
}
