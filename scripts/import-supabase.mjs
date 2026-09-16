/** Validate an Apps Script export, then upsert it into the single Supabase project. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

function envFile() {
  const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

const inputArg = process.argv.find(arg => arg.endsWith('.json'));
const apply = process.argv.includes('--apply');
if (!inputArg) throw new Error('Gunakan: npm run import:supabase -- .migration/sheets-....json [--apply]');
const input = resolve(inputArg);
if (!existsSync(input)) throw new Error(`Export tidak ditemukan: ${input}`);

const source = JSON.parse(readFileSync(input, 'utf8'));
if (source.version !== 1 || !Array.isArray(source.guests) || !Array.isArray(source.wishes)) {
  throw new Error('Format export tidak valid');
}

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const requestPattern = /^[A-Za-z0-9_-]{16,80}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestamp = value => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const stableUuid = value => {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16], 16) % 4];
  const text = hex.join('');
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
};

const seenIds = new Set();
const seenTokens = new Set();
const guests = source.guests.map((raw, index) => {
  const id = String(raw.id || '').trim().toLowerCase();
  const inviteToken = String(raw.inviteToken || '').trim();
  const name = String(raw.name || '').trim();
  if (!idPattern.test(id) || seenIds.has(id)) throw new Error(`Guest baris ${index + 1}: id invalid/duplikat`);
  if (!/^\d{8}$/.test(inviteToken) || seenTokens.has(inviteToken)) throw new Error(`Guest ${id}: token invalid/duplikat`);
  if (!name) throw new Error(`Guest ${id}: nama kosong`);
  seenIds.add(id);
  seenTokens.add(inviteToken);
  const rsvp = raw.rsvp === 'yes' || raw.rsvp === 'no' ? raw.rsvp : null;
  return {
    id,
    invite_token: inviteToken,
    name: name.slice(0, 80),
    category: String(raw.category || '').trim().slice(0, 50),
    phone: String(raw.phone || '').trim().slice(0, 30),
    invited: Math.max(1, Math.min(2, Number(raw.invited) || 1)),
    opened_at: timestamp(raw.opened),
    rsvp,
    guest_count: rsvp === 'yes' ? Math.max(1, Math.min(2, Number(raw.guests) || 1)) : 0,
    checked_in_at: timestamp(raw.checkedInAt),
    wa_sent_at: timestamp(raw.waSentAt)
  };
});

const wishes = source.wishes.map((raw, index) => {
  const name = String(raw.name || '').trim();
  const text = String(raw.text || '').trim();
  if (!name || !text) throw new Error(`Wish baris ${index + 1}: nama/ucapan kosong`);
  const seed = `${raw.id || ''}:${raw.createdAt || ''}:${name}:${text}`;
  const request = String(raw.requestId || '').trim();
  return {
    id: uuidPattern.test(String(raw.id || '')) ? String(raw.id) : stableUuid(seed),
    guest_id: null,
    name: name.slice(0, 80),
    text: text.slice(0, 600),
    created_at: timestamp(raw.createdAt) || timestamp(source.exportedAt) || new Date(0).toISOString(),
    status: raw.status === 'hidden' ? 'hidden' : 'approved',
    request_id: requestPattern.test(request) ? request : `legacy_${createHash('sha256').update(seed).digest('hex').slice(0, 48)}`
  };
});

if (!source.config || typeof source.config !== 'object' || Array.isArray(source.config)) {
  throw new Error('Config undangan kosong/tidak valid; publish dari Studio sebelum cutover');
}

console.log(`✓ Validasi: ${guests.length} tamu, ${wishes.length} ucapan, 1 config`);
if (!apply) {
  console.log('Dry run selesai. Tambahkan --apply untuk menulis ke Supabase production.');
  process.exit(0);
}

const env = envFile();
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL || '')) throw new Error('SUPABASE_URL belum valid');
if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(env.SUPABASE_SECRET_KEY || '')) throw new Error('SUPABASE_SECRET_KEY belum valid');
const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function upsertChunks(table, rows, onConflict) {
  for (let offset = 0; offset < rows.length; offset += 250) {
    const result = await client.from(table).upsert(rows.slice(offset, offset + 250), { onConflict });
    if (result.error) throw new Error(`${table}: ${result.error.code || 'error'} ${result.error.message}`);
  }
}

await upsertChunks('guests', guests, 'id');
await upsertChunks('wishes', wishes, 'id');
const configResult = await client.from('invitation_config').upsert({ id: 1, data: source.config }, { onConflict: 'id' });
if (configResult.error) throw new Error(`invitation_config: ${configResult.error.message}`);

const [guestCount, wishCount, configCount] = await Promise.all([
  client.from('guests').select('*', { count: 'exact', head: true }),
  client.from('wishes').select('*', { count: 'exact', head: true }),
  client.from('invitation_config').select('*', { count: 'exact', head: true })
]);
for (const result of [guestCount, wishCount, configCount]) if (result.error) throw new Error(result.error.message);
if ((guestCount.count || 0) < guests.length || (wishCount.count || 0) < wishes.length || configCount.count !== 1) {
  throw new Error('Verifikasi jumlah row gagal setelah import');
}
console.log(`✓ Import production selesai: ${guestCount.count} tamu, ${wishCount.count} ucapan, config tersedia.`);
