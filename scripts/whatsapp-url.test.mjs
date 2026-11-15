import assert from 'node:assert/strict';
import { test } from 'node:test';
import { whatsappMessageUrl, whatsAppTarget } from '../src/lib/whatsapp-url.ts';

const phone = '6280000000000';
const text = [
  '💍 Nama pertama & Nama kedua',
  '🗓️ Tanggal : Minggu, 3 Januari 2027',
  '🕗 Waktu : Akad 06.00 WIB · Resepsi 09.00 WIB',
  '📍 Lokasi : Nama venue, Kota',
  'Keluarga 🤍',
  'https://example.com/?g=guest-test&to=Nama%20Tamu',
  'Karakter lain: + # ? % ©️ 👩🏽‍❤️‍👨🏻'
].join('\n');

test('desktop browsers open WhatsApp Web directly', () => {
  for (const agent of ['Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/131', 'Mozilla/5.0 (Windows NT 10.0) Chrome/131', 'Mozilla/5.0 (X11; Linux x86_64) Firefox/130']) {
    assert.equal(whatsAppTarget(agent), 'web');
  }
});

test('touchscreen desktops still use Web', () => {
  assert.equal(whatsAppTarget('Mozilla/5.0 (Windows NT 10.0) Chrome/131', 10), 'web');
});

test('phones and tablets keep the mobile handoff', () => {
  for (const agent of ['Mozilla/5.0 (iPhone; CPU iPhone OS 18)', 'Mozilla/5.0 (Linux; Android 15)', 'Mozilla/5.0 (iPad; CPU OS 18)']) {
    assert.equal(whatsAppTarget(agent), 'app');
  }
  assert.equal(whatsAppTarget('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605', 5), 'app');
});

for (const target of ['web', 'app']) {
  test(`${target} URL preserves every emoji, variation selector, joined emoji, and line break`, () => {
    const url = new URL(whatsappMessageUrl(phone, text, target));
    assert.equal(url.searchParams.get('text'), text);
    assert.ok(!url.searchParams.get('text').includes('\uFFFD'));
    assert.equal(url.hostname, target === 'web' ? 'web.whatsapp.com' : 'wa.me');
    assert.equal(target === 'web' ? url.searchParams.get('phone') : url.pathname.slice(1), phone);
  });
  test(`${target} URL encodes UTF-8 emoji once`, () => {
    const link = whatsappMessageUrl(phone, text, target);
    assert.ok(link.includes('%F0%9F%92%8D'));
    assert.ok(!link.includes('%25F0%259F'));
    assert.equal(decodeURIComponent(link.split('text=')[1]), text);
  });
}
