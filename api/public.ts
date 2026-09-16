import { callBackend, sendBackendError } from '../server/data.js';
import { ApiRequest, ApiResponse, clientIp, rateLimit, readJson, rejectRateLimit, requireSameOrigin, send } from '../server/http.js';
import { actionName, invitationKey, optionalText, text } from '../server/validation.js';

const LIMITS: Record<string, [number, number]> = {
  bootstrap: [120, 60_000], getGuest: [120, 60_000], listWishes: [120, 60_000],
  rsvp: [12, 10 * 60_000], addWish: [5, 10 * 60_000], track: [40, 10 * 60_000]
};

// Leaves enough time for a cold serverless function and one database round-trip.
export const maxDuration = 30;

function payloadFor(action: string, body: Record<string, unknown>) {
  if (action === 'listWishes') return { inviteKey: invitationKey(body.inviteKey) };
  if (action === 'bootstrap' || action === 'getGuest') return { inviteKey: invitationKey(body.inviteKey) };
  if (action === 'rsvp') {
    const rsvp = body.rsvp;
    if (rsvp !== 'yes' && rsvp !== 'no') throw new Error('invalid rsvp');
    const guests = rsvp === 'yes' ? Number(body.guests) : 0;
    if (rsvp === 'yes' && (!Number.isInteger(guests) || guests < 1 || guests > 2)) throw new Error('invalid guest count');
    return { inviteKey: invitationKey(body.inviteKey), name: text(body.name, 'name', 80), rsvp, guests };
  }
  if (action === 'addWish') {
    // Honeypot: bots commonly fill every field. Return success without writing.
    if (optionalText(body.website, 100)) return { trapped: true };
    const requestId = optionalText(body.requestId, 80);
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)) throw new Error('invalid request id');
    return { inviteKey: invitationKey(body.inviteKey), name: text(body.name, 'name', 80), text: text(body.text, 'wish', 600), requestId };
  }
  if (action === 'track') {
    const event = optionalText(body.event, 32);
    if (!['open', 'open-invitation'].includes(event)) throw new Error('invalid event');
    return { inviteKey: invitationKey(body.inviteKey), event };
  }
  throw new Error('unknown action');
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  if (!requireSameOrigin(req)) return send(res, 403, { error: 'Request origin ditolak.' });

  let body: Record<string, unknown>;
  try { body = readJson(req, 64_000); }
  catch (error) { return send(res, error instanceof Error && error.message === 'payload_too_large' ? 413 : 400, { error: 'Request tidak valid.' }); }

  const action = actionName(body.action);
  if (!LIMITS[action]) return send(res, 400, { error: 'Action tidak diizinkan.' });
  const [limit, windowMs] = LIMITS[action];
  const limited = rateLimit(`public:${action}:${clientIp(req)}`, limit, windowMs);
  if (!limited.allowed) return rejectRateLimit(res, limited.retryAfter);

  try {
    const payload = payloadFor(action, body);
    if (payload.trapped) return send(res, 200, { data: null });
    const data = await callBackend(action, payload);
    // Public callers can never switch listWishes into admin/all mode.
    return send(res, 200, { data });
  } catch (error) {
    if (error instanceof Error && /invalid|required|unknown/.test(error.message)) {
      return send(res, 400, { error: error.message });
    }
    return sendBackendError(res, error);
  }
}
