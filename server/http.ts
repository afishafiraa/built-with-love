export interface ApiRequest {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

export interface ApiResponse {
  status(code: number): ApiResponse;
  json(value: unknown): void;
  setHeader(name: string, value: string | string[]): void;
  end(): void;
}

export function header(req: ApiRequest, name: string) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export function clientIp(req: ApiRequest) {
  return header(req, 'x-forwarded-for').split(',')[0].trim()
    || header(req, 'x-real-ip')
    || req.socket?.remoteAddress
    || 'unknown';
}

export function send(res: ApiResponse, status: number, value: unknown) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(status).json(value);
}

export function requireSameOrigin(req: ApiRequest) {
  const site = header(req, 'sec-fetch-site');
  if (site === 'cross-site') return false;

  const origin = header(req, 'origin');
  if (!origin) return false;
  const host = header(req, 'x-forwarded-host') || header(req, 'host');
  const proto = header(req, 'x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  return origin === `${proto}://${host}`;
}

export function readJson(req: ApiRequest, maxBytes = 64_000): Record<string, unknown> {
  const declared = Number(header(req, 'content-length') || 0);
  if (declared > maxBytes) throw new Error('payload_too_large');

  let value = req.body;
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > maxBytes) throw new Error('payload_too_large');
    try { value = JSON.parse(value); } catch { throw new Error('invalid_json'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_json');
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maxBytes) throw new Error('payload_too_large');
  return value as Record<string, unknown>;
}

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Best-effort application limiter. A Vercel Firewall rule is still required for
 * a distributed, globally consistent limit; this layer limits accidental bursts
 * and single-instance abuse even before the firewall is configured.
 */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  current.count += 1;
  if (buckets.size > 5_000) {
    for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
  }
  return {
    allowed: current.count <= limit,
    retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
  };
}

export function rejectRateLimit(res: ApiResponse, retryAfter: number) {
  res.setHeader('Retry-After', String(retryAfter));
  send(res, 429, { error: 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.' });
}
