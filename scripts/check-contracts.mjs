/** Static contract guard for browser client -> Vercel API -> Supabase. */
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const client = read('src/lib/sheets.ts');
const publicApi = read('api/public.ts');
const adminApi = read('api/admin.ts');
const data = read('server/data.ts');
const supabase = read('server/supabase.ts');
const migration = read('supabase/migrations/202609160001_initial_schema.sql');

const publicActions = ['bootstrap', 'getGuest', 'listWishes', 'rsvp', 'addWish', 'track'];
const adminActions = [
  'listGuests', 'getGuestById', 'uploadImage', 'upsertGuest', 'deleteGuest',
  'markGuestWaSent', 'checkIn', 'moderateWish', 'getConfig', 'saveConfig', 'dashboardData'
];
const serverActions = [...new Set([...publicActions, ...adminActions])];

let failed = false;
const requireText = (source, marker, label) => {
  if (source.includes(marker)) return;
  failed = true;
  console.error(`✗ ${label}: ${marker}`);
};
const forbidText = (source, marker, label) => {
  if (!source.includes(marker)) return;
  failed = true;
  console.error(`✗ ${label}: ${marker}`);
};

const adminClientBlock = client.match(/const ADMIN_ACTIONS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
const adminApiBlock = adminApi.match(/const ACTIONS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
const publicApiBlock = publicApi.match(/const LIMITS[^=]*= \{([\s\S]*?)\};/)?.[1] || '';

for (const action of adminActions) {
  requireText(adminClientBlock, `'${action}'`, `client harus mengirim ${action} ke /api/admin`);
  requireText(adminApiBlock, `'${action}'`, `/api/admin harus mengizinkan ${action}`);
}
for (const action of publicActions) requireText(publicApiBlock, action, `/api/public harus mengizinkan ${action}`);
forbidText(publicApiBlock, 'getConfig', '/api/public tidak boleh membuka config tanpa token');
requireText(publicApi, "if (action === 'listWishes') return { inviteKey: invitationKey(body.inviteKey) }", 'listWishes publik wajib membawa invite token');
requireText(client, "action === 'listWishes' && payload.all === true", 'listWishes(all) harus memakai /api/admin');
requireText(data, 'return callSupabase(action, payload)', 'runtime harus selalu menggunakan Supabase');
forbidText(data, 'callAppsScript', 'runtime tidak boleh fallback ke Apps Script');
for (const action of serverActions) requireText(supabase, `action === '${action}'`, `adapter Supabase belum menangani ${action}`);
for (const rpc of ['invitation_bootstrap', 'public_wishes', 'submit_rsvp', 'submit_wish', 'mark_invitation_opened', 'check_in_guest']) {
  requireText(migration, `function public.${rpc}`, `migration belum mendefinisikan RPC ${rpc}`);
}
requireText(migration, 'revoke all on table public.guests', 'akses anon/authenticated harus dicabut');

if (failed) process.exit(1);
console.log(`✓ Contract ${publicActions.length} public + ${adminActions.length} admin action sinkron dengan Supabase.`);
