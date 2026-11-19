import assert from 'node:assert/strict';
import { test } from 'node:test';
import { waNumber, isValidWaNumber } from '../src/lib/phone.ts';
import { whatsappMessageUrl } from '../src/lib/whatsapp-url.ts';

test('explicit country codes stay intact in WhatsApp destinations', () => {
  for (const [input, expected] of [
    ['+62 812-3456-7890', '6281234567890'],
    ['+81 70-1234-5678', '817012345678'],
    ['  +81 80 1234 5678  ', '818012345678'],
    ['+1 (202) 555-0123', '12025550123'],
    ['+44 7700 900123', '447700900123']
  ]) {
    assert.equal(waNumber(input), expected);
    assert.equal(isValidWaNumber(input), true);
    for (const target of ['app', 'web']) {
      const url = new URL(whatsappMessageUrl(waNumber(input), 'Invitation', target));
      assert.equal(target === 'web' ? url.searchParams.get('phone') : url.pathname.slice(1), expected);
    }
  }
});

test('Indonesian local numbers and numeric imports retain their normalization', () => {
  for (const input of ['0812-3456-7890', '81234567890', 81234567890, '6281234567890']) {
    assert.equal(waNumber(input), '6281234567890');
    assert.equal(isValidWaNumber(input), true);
  }
});

test('empty, too short, too long and zero country prefixes cannot be sent', () => {
  for (const input of ['', null, undefined, '+81', '+0123456789', '+1234567890123456', '07012345678']) {
    assert.equal(isValidWaNumber(input), false);
  }
  assert.equal(waNumber('+081234567890'), '081234567890');
});
