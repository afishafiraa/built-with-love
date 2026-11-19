import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeInviteRef, decodeInviteRef } from '../shared/invite-ref.mjs';
import { guestLink, parseInviteSearch } from '../src/lib/invite.ts';
import { invitationKey, guestCode } from '../server/validation.ts';

test('six-character references preserve existing unique tokens without ambiguous characters', () => {
  const seen = new Set();
  for (const number of [0, 1, 999, 9_999_999, 10_000_000, 12_345_678, 99_999_999, ...Array.from({ length: 1000 }, (_, i) => i * 99991)]) {
    const token = String(number).padStart(8, '0');
    const ref = encodeInviteRef(token);
    assert.match(ref, /^[2-9A-HJKMNP-Z]{6}$/);
    assert.equal(decodeInviteRef(ref), token);
    assert.equal(decodeInviteRef(ref.toLowerCase()), token);
    if (seen.has(ref)) assert.equal(number, 0); else seen.add(ref);
  }
  for (const invalid of ['', 'ABC', 'OOOOOO', 'IIIIII', '000000', 'ZZZZZZ', null, {}]) assert.equal(decodeInviteRef(invalid), '');
  for (const invalid of ['', '123', '123456789', 'abc12345']) assert.equal(encodeInviteRef(invalid), '');
});

test('short names remain complete with plus-separated spaces and a six-character reference', () => {
  const name = 'Shafira Putri Ananda';
  const link = guestLink('https://invitation.example', name, '12345678');
  const url = new URL(link);
  assert.ok(link.includes('?to=Shafira+Putri+Ananda&ref='));
  assert.equal(url.searchParams.get('to'), name);
  const parsed = parseInviteSearch(url.search);
  assert.equal(parsed.key, encodeInviteRef('12345678'));
  assert.equal(parsed.id, '');
  assert.equal(parsed.inviteToken, '12345678');
  assert.equal(invitationKey(parsed.key.toLowerCase()), parsed.key);
  assert.equal(guestCode('ref:' + parsed.key.toLowerCase()), 'ref:' + parsed.key);
});

test('Unicode and query characters in names round-trip without changing the reference identity', () => {
  const original = new URL(guestLink('https://invitation.example', 'Élodie & أحمد + Keluarga', '12345678'));
  assert.equal(original.searchParams.get('to'), 'Élodie & أحمد + Kelu');
  const key = parseInviteSearch(original.search).key;
  original.searchParams.set('to', 'Another name');
  assert.equal(parseInviteSearch(original.search).key, key);
  original.searchParams.delete('to');
  assert.equal(parseInviteSearch(original.search).key, key);
});

test('link names are limited to 20 Unicode characters without changing guest identity', () => {
  const name = 'Muhammad Hanif Musthofa dan Keluarga';
  const link = new URL(guestLink('https://invitation.example', name, '12345678'));
  assert.equal(link.searchParams.get('to'), 'Muhammad Hanif Musth');
  assert.equal(parseInviteSearch(link.search).inviteToken, '12345678');
  assert.equal(name, 'Muhammad Hanif Musthofa dan Keluarga');
  const unicode = new URL(guestLink('https://invitation.example', 'あ'.repeat(19) + '🌸extra', '12345678'));
  assert.equal(unicode.searchParams.get('to'), 'あ'.repeat(19) + '🌸');
  assert.equal(Array.from(unicode.searchParams.get('to')).length, 20);
  const spaced = new URL(guestLink('https://invitation.example', '  Guest   Name  ', '12345678'));
  assert.equal(spaced.searchParams.get('to'), 'Guest Name');
});

test('legacy links still work and a malformed new reference cannot fall back to a legacy name', () => {
  const legacy = parseInviteSearch('?to=guest-name-12345678');
  assert.equal(legacy.key, 'guest-name-12345678');
  assert.equal(legacy.id, 'guest-name');
  assert.equal(invitationKey(legacy.key), legacy.key);
  for (const search of ['?to=Guest+Name', '?to=guest-name-12345678&ref=', '?to=guest-name-12345678&ref=invalid', '?ref=222222&ref=222222']) {
    assert.equal(parseInviteSearch(search).key, '');
    assert.equal(parseInviteSearch(search).supplied, true);
  }
  assert.equal(parseInviteSearch('').supplied, false);
  assert.throws(() => invitationKey('Guest Name'), /invalid invitation link/);
});
