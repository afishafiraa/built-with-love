/**
 * Cek koneksi ke backend Apps Script: `npm run check:sheets`
 *
 * Hanya memanggil aksi baca (getConfig, listGuests, listWishes), jadi tidak
 * menulis apa pun ke spreadsheet. Dipakai untuk memastikan SHEETS_ENDPOINT
 * dan SHEETS_TOKEN server-side cocok dengan deployment + Script properties.
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
const endpoint = env.SHEETS_ENDPOINT || '';
const token = env.SHEETS_TOKEN || '';

console.log('\n  Cek backend Sheets\n  ------------------');

if (!endpoint || endpoint.includes('XXXX')) {
  fail('SHEETS_ENDPOINT masih contoh.\n    Deploy dulu apps-script/Code.gs (Deploy > New deployment > Web app),\n    lalu tempel URL /exec-nya ke .env');
}
if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(endpoint)) {
  fail('SHEETS_ENDPOINT harus URL Web App yang diakhiri /exec.\n    Sekarang: ' + endpoint);
}
if (!token || token === 'ganti-dengan-rahasia') {
  fail('SHEETS_TOKEN masih contoh. Isi dengan nilai SECRET di Script properties.');
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
let guestRows = [];
let wishRows = [];
async function step(label, fn) {
  try { ok(label + ' — ' + (await fn())); }
  catch (e) {
    failed++;
    bad(label + ' — ' + e.message);
    if (/unauthorized/.test(e.message)) {
      console.log('      SHEETS_TOKEN di .env beda dengan SECRET di Script properties.');
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
  guestRows = await call('listGuests');
  return (guestRows?.length ?? 0) + ' tamu';
});
await step('listWishes', async () => {
  wishRows = await call('listWishes', { all: true });
  return (wishRows?.length ?? 0) + ' ucapan';
});
await step('getConfig', async () => {
  const c = await call('getConfig');
  return c ? 'konten sudah diterbitkan dari /studio' : 'belum ada (normal sebelum Terbitkan)';
});
await step('dashboardData', async () => {
  const data = await call('dashboardData');
  if (!data || !Array.isArray(data.guests) || !Array.isArray(data.wishes) || !('config' in data)) {
    throw new Error('contract dashboard tidak lengkap — deploy Code.gs versi terbaru');
  }
  return 'contract dashboard lengkap';
});
await step('schema Guests', async () => {
  if (!guestRows.length) return 'belum ada baris; header periksa manual';
  if (!guestRows.every(g => Object.prototype.hasOwnProperty.call(g, 'inviteToken') && /^\d{8}$/.test(String(g.inviteToken)))) {
    throw new Error('inviteToken hilang/tidak 8 digit — jalankan setup()');
  }
  return 'inviteToken seluruh tamu valid';
});
await step('schema Wishes', async () => {
  if (!wishRows.length) return 'belum ada baris; header periksa manual';
  if (!wishRows.every(w => Object.prototype.hasOwnProperty.call(w, 'requestId'))) {
    throw new Error('kolom requestId belum ada — jalankan setup()');
  }
  return 'kolom requestId tersedia';
});

const sampleGuest = guestRows.find(g => g && g.id && /^\d{8}$/.test(String(g.inviteToken)));
if (sampleGuest) {
  const validKey = String(sampleGuest.id) + '-' + String(sampleGuest.inviteToken);
  await step('bootstrap token valid', async () => {
    const data = await call('bootstrap', { inviteKey: validKey });
    if (!data?.guest || String(data.guest.id) !== String(sampleGuest.id) || !('config' in data)) {
      throw new Error('tamu/config tidak cocok');
    }
    return 'tamu terverifikasi';
  });
  await step('bootstrap token salah', async () => {
    const last = Number(validKey.slice(-1));
    const invalidKey = validKey.slice(0, -1) + String((last + 1) % 10);
    const data = await call('bootstrap', { inviteKey: invalidKey });
    if (data?.guest) throw new Error('token yang diubah masih diterima');
    return 'ditolak dengan benar';
  });
} else {
  bad('bootstrap token — tidak ada tamu bertoken untuk diuji');
  failed++;
}

if (failed) {
  console.log('\n  \x1b[31m' + failed + ' cek gagal.\x1b[0m Perbaiki lalu jalankan lagi.\n');
  process.exit(1);
}
console.log('\n  \x1b[32mBackend siap.\x1b[0m Jalankan `npm run dev:full`, lalu buka URL /dashboard yang dicetak terminal.\n');
