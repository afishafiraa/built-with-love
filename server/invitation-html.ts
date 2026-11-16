import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ApiRequest } from './http.js';

export async function loadInvitationHtml(req: ApiRequest) {
  const host = typeof req.headers.host === 'string' ? req.headers.host : '';
  if (process.env.VERCEL_ENV !== 'production' && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host)) {
    // Vite supplies module URLs and the React Refresh preamble in development.
    const response = await fetch(`http://${host}/invitation-shell.html`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('development_html_unavailable');
    return response.text();
  }
  return readFile(join(process.cwd(), 'dist/invitation-shell.html'), 'utf8');
}
