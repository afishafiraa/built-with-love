import { ApiResponse, send } from './http.js';
import { callSupabase } from './supabase.js';

/** Supabase is the sole runtime database. */
export function callBackend(action: string, payload: Record<string, unknown> = {}) {
  return callSupabase(action, payload);
}

export function sendBackendError(res: ApiResponse, error: unknown) {
  const message = error instanceof Error ? error.message : 'backend_unavailable';
  if (message === 'database_not_configured') {
    send(res, 503, { error: 'Backend production belum dikonfigurasi dengan benar.' });
    return;
  }
  if (message === 'database_conflict') {
    send(res, 409, { error: 'Data berubah bersamaan. Muat ulang lalu coba lagi.' });
    return;
  }
  if (/required|invalid|not found|too large|not an image/i.test(message)) {
    send(res, 400, { error: message });
    return;
  }
  send(res, 503, { error: 'Backend sementara tidak dapat dihubungi.' });
}
