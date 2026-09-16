import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const banned = [
  'VITE_SHEETS_TOKEN', 'VITE_ADMIN_PIN', 'VITE_SHEETS_ENDPOINT',
  'VITE_CLOUDINARY_PRESET', 'VITE_CLOUDINARY_CLOUD',
  'VITE_SUPABASE_SECRET_KEY', 'VITE_SUPABASE_SERVICE_ROLE_KEY'
];
const secretKeys = [
  ...banned, 'SHEETS_TOKEN', 'SHEETS_ENDPOINT', 'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_PASSWORD_HASH', 'SESSION_SECRET'
];
const files = [];
function collect(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) collect(path);
    else if (/\.(js|mjs|cjs|ts|tsx|html)$/.test(name)) files.push(path);
  }
}
collect('src');
collect('dist');

let failed = false;
for (const path of files) {
  const source = readFileSync(path, 'utf8');
  for (const marker of banned) {
    if (source.includes(marker)) {
      failed = true;
      console.error(`✗ ${marker} ditemukan di ${path}`);
    }
  }
}

// If a developer still has legacy keys in .env, verify their actual values did
// not enter dist. Never print the values themselves.
if (existsSync('.env')) {
  const env = readFileSync('.env', 'utf8');
  for (const key of secretKeys) {
    const match = env.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`, 'm'));
    const value = match?.[1]?.replace(/^['"]|['"]$/g, '') || '';
    if (value.length >= 6 && files.some(path => path.startsWith('dist/') && readFileSync(path, 'utf8').includes(value))) {
      failed = true;
      console.error(`✗ Nilai ${key} ditemukan di bundle produksi.`);
    }
  }
}

if (failed) process.exit(1);
console.log('✓ Tidak ada credential server di source frontend atau bundle produksi.');
