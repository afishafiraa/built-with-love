import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { shouldSendAlert } from './monitor-policy.mjs';

const now = Date.parse('2026-11-06T10:00:00Z');

test('initial success stays quiet, first failure alerts', () => {
  assert.equal(shouldSendAlert({ status: 'unknown' }, true, now, 24), false);
  assert.equal(shouldSendAlert({ status: 'unknown' }, false, now, 24), true);
});

test('failure repeats only after the reminder interval', () => {
  const state = { status: 'failed', lastNotifiedAt: '2026-11-06T09:00:00Z' };
  assert.equal(shouldSendAlert(state, false, now, 24), false);
  assert.equal(shouldSendAlert(state, false, now + 23 * 3600000, 24), true);
});

test('recovery alerts once', () => {
  assert.equal(shouldSendAlert({ status: 'failed' }, true, now, 24), true);
  assert.equal(shouldSendAlert({ status: 'healthy' }, true, now, 24), false);
});
