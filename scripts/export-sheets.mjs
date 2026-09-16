/** One-time, read-only export from the legacy Apps Script backend. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function envFile() {
  let raw;
  try { raw = readFileSync(new URL('../.env', import.meta.url), 'utf8'); }
  catch { throw new Error('.env tidak ditemukan'); }
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

const env = envFile();
const endpoint = env.SHEETS_ENDPOINT || '';
const token = env.SHEETS_TOKEN || '';
if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(endpoint) || !token) {
  throw new Error('SHEETS_ENDPOINT/SHEETS_TOKEN migrasi belum valid di .env');
}

async function call(action, payload = {}) {
  let last = 'Apps Script tidak menjawab';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, token, ...payload }),
        redirect: 'follow'
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = JSON.parse(text);
      if (json.error) throw new Error(String(json.error));
      return json.data;
    } catch (error) {
      last = error instanceof Error ? error.message : last;
      if (attempt < 3) await new Promise(resolveWait => setTimeout(resolveWait, 500 * attempt));
    }
  }
  throw new Error(last);
}

console.log('Mengekspor data lama secara read-only…');
const [guests, wishes, config] = await Promise.all([
  call('listGuests'),
  call('listWishes', { all: true }),
  call('getConfig')
]);

const exportedAt = new Date().toISOString();
const exportData = { version: 1, exportedAt, guests, wishes, config };
const directory = resolve('.migration');
mkdirSync(directory, { recursive: true });
const target = resolve(directory, `sheets-${exportedAt.replace(/[:.]/g, '-')}.json`);
writeFileSync(target, JSON.stringify(exportData, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });

console.log(`✓ ${guests.length} tamu, ${wishes.length} ucapan, config ${config ? 'ada' : 'kosong'}`);
console.log(`✓ Export lokal: ${target}`);
console.log('File berada di .gitignore dan jangan di-commit.');
