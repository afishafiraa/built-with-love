import { randomBytes, scryptSync } from 'node:crypto';
import { stdin, stdout } from 'node:process';

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

if (!stdin.isTTY || !stdout.isTTY) {
  console.error('Jalankan script ini langsung dari terminal interaktif.');
  process.exit(1);
}

function readHidden(label) {
  return new Promise((resolve, reject) => {
    let value = '';
    let finished = false;

    const restoreTerminal = () => {
      if (finished) return;
      finished = true;
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdout.write('\n');
    };

    const onData = (input) => {
      for (const character of input) {
        if (character === '\u0003') {
          restoreTerminal();
          reject(new Error('Dibatalkan.'));
          return;
        }

        if (character === '\r' || character === '\n') {
          restoreTerminal();
          resolve(value);
          return;
        }

        if (character === '\u007f' || character === '\b') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }

        if (character >= ' ') {
          value += character;
          stdout.write('*');
        }
      }
    };

    stdout.write(label);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

try {
  console.log('\nBuat password admin pilihanmu. Input tidak akan ditampilkan atau disimpan.');
  console.log(`Gunakan minimal ${MIN_PASSWORD_LENGTH} karakter; passphrase yang mudah diingat disarankan.\n`);

  const password = await readHidden('Password baru: ');

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password minimal ${MIN_PASSWORD_LENGTH} karakter.`);
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Password maksimal ${MAX_PASSWORD_LENGTH} karakter.`);
  }

  const confirmation = await readHidden('Ulangi password: ');
  if (password !== confirmation) {
    throw new Error('Password tidak sama. Jalankan kembali script.');
  }

  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  const encodedHash = [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$');

  console.log('\nSalin nilai berikut ke ADMIN_PASSWORD_HASH:');
  console.log(`ADMIN_PASSWORD_HASH=${encodedHash}`);
  console.log('\nPassword asli tetap hanya kamu yang menyimpan dan gunakan saat login.');
} catch (error) {
  console.error(`\nGagal: ${error instanceof Error ? error.message : 'Terjadi kesalahan.'}`);
  process.exitCode = 1;
} finally {
  stdin.pause();
}
