/**
 * Cek koneksi ke backend Apps Script: `npm run check:sheets`
 *
 * Hanya memanggil aksi baca (getConfig, listGuests, listWishes), jadi tidak
 * menulis apa pun ke spreadsheet. Dipakai untuk memastikan VITE_SHEETS_ENDPOINT
 * dan VITE_SHEETS_TOKEN di .env cocok dengan deployment + Script properties.
 */
import { readFileSync } from 'node:fs';

function readEnv() {
  let raw = '';
  try { raw = readFileSync(new URL('../.env', import.meta.url), 'utf8'); }
  catch { fail('.env tidak ditemukan. Jalankan: cp .env.example .env'); }
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const ok = (m) => console.log('  \x1b[32m✓\x1b[0m ' + m);
const bad = (m) => console.log('  \x1b[31m✗\x1b[0m ' + m);
function fail(m) { console.log('\n  \x1b[31m✗\x1b[0m ' + m + '\n'); process.exit(1); }

const env = readEnv();
const endpoint = env.VITE_SHEETS_ENDPOINT || '';
const token = env.VITE_SHEETS_TOKEN || '';

console.log('\n  Cek backend Sheets\n  ------------------');

if (!endpoint || endpoint.includes('XXXX')) {
  fail('VITE_SHEETS_ENDPOINT masih contoh.\n    Deploy dulu apps-script/Code.gs (Deploy > New deployment > Web app),\n    lalu tempel URL /exec-nya ke .env');
}
if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(endpoint)) {
  fail('VITE_SHEETS_ENDPOINT harus URL Web App yang diakhiri /exec.\n    Sekarang: ' + endpoint);
}
if (!token || token === 'ganti-dengan-rahasia') {
  fail('VITE_SHEETS_TOKEN masih contoh. Isi dengan nilai SECRET di Script properties.');
}
ok('Format .env benar');

/* Apps Script answers a POST with a 302 to script.googleusercontent.com, and that
   hop can return a one-off 404 on a freshly created deployment. Retry so a warm-up
   blip does not look like a broken setup. */
async function call(action, payload = {}, tries = 3) {
  let res, text;
  for (let i = 1; ; i++) {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token, ...payload }),
      redirect: 'follow'
    });
    text = await res.text();
    if (res.ok || i >= tries) break;
    await new Promise(r => setTimeout(r, 600 * i));
  }
  if (!res.ok) throw new Error('HTTP ' + res.status + ' setelah ' + tries + ' percobaan');
  let json;
  try { json = JSON.parse(text); }
  catch {
    throw new Error(
      /Google Drive|Sign in/i.test(text)
        ? 'endpoint minta login — set Access: "Anyone" di Deploy > Manage deployments'
        : 'jawaban bukan JSON (deployment mungkin belum diperbarui)'
    );
  }
  if (json.error) throw new Error(json.error);
  return json.data;
}

let failed = 0;
async function step(label, fn) {
  try { ok(label + ' — ' + (await fn())); }
  catch (e) {
    failed++;
    bad(label + ' — ' + e.message);
    if (/unauthorized/.test(e.message)) {
      console.log('      VITE_SHEETS_TOKEN di .env beda dengan SECRET di Script properties.');
    }
    if (/setup\(\)/.test(e.message)) {
      console.log('      Buka editor Apps Script > pilih fungsi `setup` > Run.');
    }
    if (/SHEET_ID/.test(e.message)) {
      console.log('      Script properties > tambah SHEET_ID = id dari URL spreadsheet');
      console.log('      (.../spreadsheets/d/<SHEET_ID>/edit).');
    }
  }
}

await step('listGuests', async () => {
  const g = await call('listGuests');
  return (g?.length ?? 0) + ' tamu';
});
await step('listWishes', async () => {
  const w = await call('listWishes', { all: true });
  return (w?.length ?? 0) + ' ucapan';
});
await step('getConfig', async () => {
  const c = await call('getConfig');
  return c ? 'konten sudah diterbitkan dari /studio' : 'belum ada (normal sebelum Terbitkan)';
});

if (failed) {
  console.log('\n  \x1b[31m' + failed + ' cek gagal.\x1b[0m Perbaiki lalu jalankan lagi.\n');
  process.exit(1);
}
console.log('\n  \x1b[32mBackend siap.\x1b[0m Buka http://localhost:5173/dashboard\n');
