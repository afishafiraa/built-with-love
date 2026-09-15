import { randomBytes, scryptSync } from 'node:crypto';

const password = randomBytes(18).toString('base64url');
const salt = randomBytes(16);
const N = 16384, r = 8, p = 1;
const hash = scryptSync(password, salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 });

console.log('\nSecurity values baru — simpan password di password manager:\n');
console.log('ADMIN_PASSWORD=' + password);
console.log('ADMIN_PASSWORD_HASH=' + ['scrypt', N, r, p, salt.toString('base64url'), hash.toString('base64url')].join('$'));
console.log('SESSION_SECRET=' + randomBytes(48).toString('base64url'));
console.log('SHEETS_TOKEN=' + randomBytes(32).toString('base64url'));
console.log('\nADMIN_PASSWORD hanya dipakai saat login; jangan masukkan nilainya ke Vercel.\n');
