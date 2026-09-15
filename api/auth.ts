import { authConfigured, clearSessionCookies, createSession, readSession, setSessionCookies, validCsrf, verifyPassword } from '../server/auth.js';
import { ApiRequest, ApiResponse, clientIp, rateLimit, readJson, rejectRateLimit, requireSameOrigin, send } from '../server/http.js';

export default function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'GET') {
    const session = readSession(req);
    return send(res, 200, { data: { authenticated: !!session, expiresAt: session?.exp || null } });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  if (!requireSameOrigin(req)) return send(res, 403, { error: 'Request origin ditolak.' });

  let body: Record<string, unknown>;
  try { body = readJson(req, 8_000); }
  catch { return send(res, 400, { error: 'Request tidak valid.' }); }

  if (body.action === 'logout') {
    const session = readSession(req);
    if (session && !validCsrf(req, session)) return send(res, 403, { error: 'Token CSRF tidak valid.' });
    clearSessionCookies(req, res);
    return send(res, 200, { data: { authenticated: false } });
  }
  if (body.action !== 'login') return send(res, 400, { error: 'Action tidak diizinkan.' });
  if (!authConfigured()) return send(res, 503, { error: 'Login server belum dikonfigurasi.' });

  const limited = rateLimit(`login:${clientIp(req)}`, 6, 15 * 60_000);
  if (!limited.allowed) return rejectRateLimit(res, limited.retryAfter);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password || password.length > 256 || !verifyPassword(password)) {
    return send(res, 401, { error: 'Password salah.' });
  }

  const { session, token } = createSession();
  setSessionCookies(req, res, token, session.csrf);
  return send(res, 200, { data: { authenticated: true, expiresAt: session.exp } });
}
