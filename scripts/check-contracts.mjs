/** Static contract guard for browser client -> Vercel API -> Apps Script. */
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const sheets = read('src/lib/sheets.ts');
const publicApi = read('api/public.ts');
const adminApi = read('api/admin.ts');
const appsScript = read('apps-script/Code.gs');

const publicActions = ['bootstrap', 'getConfig', 'getGuest', 'listWishes', 'rsvp', 'addWish', 'track'];
const adminActions = [
  'listGuests', 'getGuestById', 'uploadImage', 'upsertGuest', 'deleteGuest',
  'markGuestWaSent', 'checkIn', 'moderateWish', 'saveConfig', 'dashboardData'
];
const appsScriptActions = [...new Set([...publicActions, ...adminActions])];

let failed = false;
const requireText = (source, marker, label) => {
  if (source.includes(marker)) return;
  failed = true;
  console.error(`✗ ${label}: ${marker}`);
};

const adminClientBlock = sheets.match(/const ADMIN_ACTIONS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
const adminApiBlock = adminApi.match(/const ACTIONS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
const publicApiBlock = publicApi.match(/const LIMITS[^=]*= \{([\s\S]*?)\};/)?.[1] || '';

for (const action of adminActions) {
  requireText(adminClientBlock, `'${action}'`, `client harus mengirim ${action} ke /api/admin`);
  requireText(adminApiBlock, `'${action}'`, `/api/admin harus mengizinkan ${action}`);
}
for (const action of publicActions) {
  requireText(publicApiBlock, action, `/api/public harus mengizinkan ${action}`);
}
requireText(sheets, "action === 'listWishes' && payload.all === true", 'listWishes(all) harus memakai /api/admin');
for (const action of appsScriptActions) {
  requireText(appsScript, `case '${action}'`, `Apps Script belum menangani ${action}`);
}

if (failed) process.exit(1);
console.log(`✓ Contract ${publicActions.length} public + ${adminActions.length} admin action sinkron.`);
