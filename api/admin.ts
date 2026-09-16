import { callBackend, sendBackendError } from '../server/data.js';
import { readSession, validCsrf } from '../server/auth.js';
import { ApiRequest, ApiResponse, clientIp, rateLimit, readJson, rejectRateLimit, requireSameOrigin, send } from '../server/http.js';
import { actionName, guestCode, guestId, optionalText, text } from '../server/validation.js';

const ACTIONS = new Set([
  'listGuests', 'getGuestById', 'uploadImage', 'upsertGuest', 'deleteGuest',
  'markGuestWaSent', 'checkIn', 'listWishes', 'moderateWish', 'deleteWish', 'getConfig', 'saveConfig', 'dashboardData'
]);

// dashboardData performs three parallel database reads.
export const maxDuration = 30;

function payloadFor(action: string, body: Record<string, unknown>) {
  if (action === 'listGuests' || action === 'getConfig' || action === 'dashboardData') return {};
  if (action === 'listWishes') return { all: true };
  if (action === 'getGuestById' || action === 'checkIn') return { guestId: guestCode(body.guestId) };
  if (action === 'deleteGuest') return { id: guestId(body.id) };
  if (action === 'deleteWish') return { id: text(body.id, 'wish id', 100) };
  if (action === 'markGuestWaSent') return { id: guestId(body.id), sent: body.sent !== false };
  if (action === 'moderateWish') {
    if (body.status !== 'approved' && body.status !== 'hidden') throw new Error('invalid wish status');
    return { id: text(body.id, 'wish id', 100), status: body.status };
  }
  if (action === 'upsertGuest') {
    const source = body.guest;
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('guest required');
    const raw = source as Record<string, unknown>;
    const guest: Record<string, unknown> = { id: guestId(raw.id), name: text(raw.name, 'guest name', 80) };
    if (raw.phone !== undefined) guest.phone = optionalText(raw.phone, 30);
    if (raw.category !== undefined) guest.category = optionalText(raw.category, 50);
    if (raw.invited !== undefined) {
      const invited = Number(raw.invited);
      if (!Number.isInteger(invited) || invited < 1 || invited > 2) throw new Error('invalid invited count');
      guest.invited = invited;
    }
    return { guest };
  }
  if (action === 'saveConfig') {
    if (!body.config || typeof body.config !== 'object' || Array.isArray(body.config)) throw new Error('config required');
    if (JSON.stringify(body.config).length > 49_000) throw new Error('config too large');
    return { config: body.config };
  }
  if (action === 'uploadImage') {
    const mime = optionalText(body.mime, 60).toLowerCase();
    if (!/^image\/(jpeg|png|webp|gif)$/.test(mime)) throw new Error('invalid image type');
    if (typeof body.data !== 'string' || !body.data || body.data.length > 4_000_000 || !/^[a-zA-Z0-9+/]+=*$/.test(body.data)) {
      throw new Error('invalid image data');
    }
    const data = body.data;
    return { mime, data, name: optionalText(body.name, 80) || 'gambar' };
  }
  throw new Error('unknown action');
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  if (!requireSameOrigin(req)) return send(res, 403, { error: 'Request origin ditolak.' });
  const session = readSession(req);
  if (!session) return send(res, 401, { error: 'Sesi admin berakhir. Silakan masuk lagi.' });
  if (!validCsrf(req, session)) return send(res, 403, { error: 'Token CSRF tidak valid.' });

  const limited = rateLimit(`admin:${clientIp(req)}`, 180, 60_000);
  if (!limited.allowed) return rejectRateLimit(res, limited.retryAfter);

  let body: Record<string, unknown>;
  try { body = readJson(req, 4_200_000); }
  catch (error) { return send(res, error instanceof Error && error.message === 'payload_too_large' ? 413 : 400, { error: 'Request tidak valid.' }); }
  const action = actionName(body.action);
  if (!ACTIONS.has(action)) return send(res, 400, { error: 'Action tidak diizinkan.' });

  try {
    const data = await callBackend(action, payloadFor(action, body));
    return send(res, 200, { data });
  } catch (error) {
    if (error instanceof Error && /invalid|required|unknown|too large/.test(error.message)) {
      return send(res, 400, { error: error.message });
    }
    return sendBackendError(res, error);
  }
}
