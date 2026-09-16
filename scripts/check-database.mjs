/** Read-only production database smoke test. */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const env = {};
for (const line of raw.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL || '')) throw new Error('SUPABASE_URL belum valid di .env');
if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(env.SUPABASE_SECRET_KEY || '')) throw new Error('SUPABASE_SECRET_KEY belum valid di .env');

const client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const ok = message => console.log(`  ✓ ${message}`);

console.log('\n  Cek Supabase production\n  ------------------------');
const [guests, wishes, config, bucket] = await Promise.all([
  client.from('guests').select('id,invite_token,name', { count: 'exact' }).limit(1),
  client.from('wishes').select('*', { count: 'exact', head: true }),
  client.from('invitation_config').select('*', { count: 'exact', head: true }),
  client.storage.getBucket('invitation-assets')
]);
for (const [label, result] of [['guests', guests], ['wishes', wishes], ['config', config], ['storage', bucket]]) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
}
ok(`${guests.count || 0} tamu, ${wishes.count || 0} ucapan, ${config.count || 0} config`);
ok('bucket invitation-assets tersedia');

const sample = guests.data?.[0];
if (!sample) throw new Error('Belum ada tamu untuk menguji token');
const inviteKey = `${sample.id}-${sample.invite_token}`;
const valid = await client.rpc('invitation_bootstrap', { p_invite_key: inviteKey });
if (valid.error || !valid.data?.guest || !valid.data?.config) throw new Error(`bootstrap valid gagal: ${valid.error?.message || 'data kosong'}`);
ok('bootstrap token valid mengembalikan tamu + config');

const lastDigit = Number(inviteKey.slice(-1));
const invalidKey = `${inviteKey.slice(0, -1)}${(lastDigit + 1) % 10}`;
const invalid = await client.rpc('invitation_bootstrap', { p_invite_key: invalidKey });
if (invalid.error || invalid.data?.guest || invalid.data?.config) throw new Error('bootstrap token salah masih membocorkan data');
ok('bootstrap token salah ditolak tanpa membocorkan config');
console.log('\n  ✓ Database production siap untuk smoke test aplikasi.\n');
