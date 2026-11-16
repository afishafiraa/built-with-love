const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const BASE = ALPHABET.length;

export function encodeInviteRef(token) {
  if (typeof token !== 'string' || !/^\d{8}$/.test(token)) return '';
  let value = Number(token);
  let ref = '';
  for (let i = 0; i < 6; i++) {
    ref = ALPHABET[value % BASE] + ref;
    value = Math.floor(value / BASE);
  }
  return ref;
}

export function decodeInviteRef(input) {
  if (typeof input !== 'string') return '';
  const ref = input.trim().toUpperCase();
  if (ref.length !== 6) return '';
  let value = 0;
  for (const character of ref) {
    const digit = ALPHABET.indexOf(character);
    if (digit < 0) return '';
    value = value * BASE + digit;
  }
  return value <= 99_999_999 ? String(value).padStart(8, '0') : '';
}
