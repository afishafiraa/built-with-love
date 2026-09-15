import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { ApiRequest, ApiResponse, header } from './http.js';

const SESSION_COOKIE = 'wedding_session';
const CSRF_COOKIE = 'wedding_csrf';
const SESSION_AGE_SECONDS = 8 * 60 * 60;

type Session = { role: 'admin'; exp: number; csrf: string };

function secret() {
  const value = process.env.SESSION_SECRET || '';
  return value.length >= 32 ? value : '';
}

function cookies(req: ApiRequest) {
  return Object.fromEntries(header(req, 'cookie').split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function signature(value: string) {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyPassword(password: string) {
  const parts = (process.env.ADMIN_PASSWORD_HASH || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nText, rText, pText, saltText, expectedText] = parts;
  const N = Number(nText), r = Number(rText), p = Number(pText);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  try {
    const expected = Buffer.from(expectedText, 'base64url');
    const actual = scryptSync(password, Buffer.from(saltText, 'base64url'), expected.length, {
      N, r, p, maxmem: Math.max(64 * 1024 * 1024, 256 * N * r)
    });
    return expected.length > 0 && timingSafeEqual(actual, expected);
  } catch { return false; }
}

export function createSession() {
  const session: Session = {
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + SESSION_AGE_SECONDS,
    csrf: randomBytes(24).toString('base64url')
  };
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return { session, token: `${payload}.${signature(payload)}` };
}

export function readSession(req: ApiRequest): Session | null {
  if (!secret()) return null;
  const token = cookies(req)[SESSION_COOKIE] || '';
  const [payload, supplied] = token.split('.');
  if (!payload || !supplied || !safeEqual(signature(payload), supplied)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session;
    if (value.role !== 'admin' || !value.csrf || value.exp <= Math.floor(Date.now() / 1000)) return null;
    return value;
  } catch { return null; }
}

function cookieSecurity(req: ApiRequest) {
  const host = header(req, 'x-forwarded-host') || header(req, 'host');
  const proto = header(req, 'x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  return proto === 'https' ? '; Secure' : '';
}

export function setSessionCookies(req: ApiRequest, res: ApiResponse, token: string, csrf: string) {
  const security = cookieSecurity(req);
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_AGE_SECONDS}${security}`,
    `${CSRF_COOKIE}=${encodeURIComponent(csrf)}; Path=/; SameSite=Strict; Max-Age=${SESSION_AGE_SECONDS}${security}`
  ]);
}

export function clearSessionCookies(req: ApiRequest, res: ApiResponse) {
  const security = cookieSecurity(req);
  res.setHeader('Set-Cookie', [
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${security}`,
    `${CSRF_COOKIE}=; Path=/; SameSite=Strict; Max-Age=0${security}`
  ]);
}

export function validCsrf(req: ApiRequest, session: Session) {
  const csrfCookie = cookies(req)[CSRF_COOKIE] || '';
  const csrfHeader = header(req, 'x-csrf-token');
  return !!csrfCookie && safeEqual(csrfCookie, session.csrf) && safeEqual(csrfHeader, session.csrf);
}

export function authConfigured() {
  return !!secret() && (process.env.ADMIN_PASSWORD_HASH || '').startsWith('scrypt$');
}
