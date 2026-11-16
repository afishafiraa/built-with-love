import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { encodeInviteRef } from '../shared/invite-ref.mjs';

const originalFetch = globalThis.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_SECRET_KEY;
process.env.SUPABASE_URL = 'https://config-storage-test.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'sb_secret_config_storage_test';
let responses = [];
let requests = [];
globalThis.fetch = async (input, options) => {
  const url = new URL(input);
  assert.equal(url.hostname, 'config-storage-test.supabase.co');
  requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), method: options?.method, body: options?.body ? JSON.parse(options.body) : null });
  const response = responses.shift();
  assert.ok(response, 'Unexpected database request');
  return new Response(response.status === 204 ? null : JSON.stringify(response.body), {
    status: response.status, headers: { 'content-type': 'application/json' }
  });
};
const { callSupabase } = await import('../server/supabase.ts');
const config = { groomName: 'Test groom', brideName: 'Test bride' };
const errorResponse = code => ({ status: code === '42501' ? 403 : 404, body: { code, message: 'Test database failure' } });

beforeEach(() => { responses = []; requests = []; });
after(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = originalKey;
});

test('publish uses atomic history RPC when installed', async () => {
  responses.push({ status: 200, body: 17 });
  assert.equal(await callSupabase('saveConfig', { config, note: 'Test note' }), 17);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, '/rest/v1/rpc/publish_invitation_config');
  assert.deepEqual(requests[0].body, { p_data: config, p_note: 'Test note' });
});

test('missing history RPC still publishes the supplied config to the existing row', async () => {
  responses.push(errorResponse('PGRST202'), { status: 204 });
  assert.equal(await callSupabase('saveConfig', { config }), null);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].path, '/rest/v1/invitation_config');
  assert.equal(requests[1].method, 'POST');
  assert.deepEqual(requests[1].body, { id: 1, data: config });
});

test('RPC permission failure never bypasses the RPC by writing directly', async () => {
  responses.push(errorResponse('42501'));
  await assert.rejects(callSupabase('saveConfig', { config }), /database_unavailable/);
  assert.equal(requests.length, 1);
});

test('fallback storage failures remain failures', async () => {
  responses.push(errorResponse('PGRST202'), errorResponse('42501'));
  await assert.rejects(callSupabase('saveConfig', { config }), /database_unavailable/);
  assert.equal(requests.length, 2);
});

for (const code of ['PGRST205', '42P01']) {
  test(`history missing (${code}) returns an unavailable empty history without blocking Studio`, async () => {
    responses.push(errorResponse(code));
    assert.deepEqual(await callSupabase('listConfigVersions'), []);
    assert.equal(requests.length, 1);
  });
}

test('other history errors are not treated as an empty history', async () => {
  responses.push(errorResponse('42501'));
  await assert.rejects(callSupabase('listConfigVersions'), /database_unavailable/);
});

test('installed history returns stored versions unchanged', async () => {
  responses.push({ status: 200, body: [{ id: 17, data: config, note: 'Stored note', created_at: '2026-11-15T00:00:00Z' }] });
  assert.deepEqual(await callSupabase('listConfigVersions'), [{ id: 17, config, note: 'Stored note', createdAt: '2026-11-15T00:00:00Z' }]);
});

test('a guest without a WhatsApp number still gets a private invitation token', async () => {
  responses.push({ status: 200, body: null }, { status: 201, body: { id: 'guest-no-phone', invite_token: '12345678' } });
  assert.deepEqual(await callSupabase('upsertGuest', { guest: { id: 'guest-no-phone', name: 'Test guest without phone', phone: '', invited: 2 } }), { id: 'guest-no-phone', inviteToken: '12345678' });
  assert.equal(requests[1].path, '/rest/v1/guests');
  assert.equal(requests[1].body.phone, '');
  assert.match(requests[1].body.invite_token, /^\d{8}$/);
  assert.equal(requests[1].body.name, 'Test guest without phone');
});

const wishPayload = { inviteKey: 'test-guest-12345678', name: 'Guest', text: 'Best wishes', requestId: 'wish-request-test-1234' };
const verifiedGuest = { status: 200, body: { id: 'test-guest', name: 'Guest' } };

test('wish allowance counts stored messages including hidden ones for the verified invitation', async () => {
  responses.push(verifiedGuest, { status: 200, body: [{ id: 'one' }, { id: 'two' }] });
  assert.deepEqual(await callSupabase('wishStatus', wishPayload), { sentCount: 2, limit: 2 });
  assert.equal(requests[1].path, '/rest/v1/wishes');
});

for (const count of [0, 1]) {
  test(`invitation with ${count} existing wishes can submit`, async () => {
    responses.push(verifiedGuest, { status: 200, body: null }, { status: 200, body: Array.from({ length: count }, (_, i) => ({ id: String(i) })) }, { status: 200, body: 'saved-wish' });
    assert.deepEqual(await callSupabase('addWish', wishPayload), { id: 'saved-wish' });
    assert.equal(requests.at(-1).path, '/rest/v1/rpc/submit_wish');
  });
}

test('a third wish returns the explicit limit and never calls the insert RPC', async () => {
  responses.push(verifiedGuest, { status: 200, body: null }, { status: 200, body: [{ id: 'one' }, { id: 'two' }] });
  await assert.rejects(callSupabase('addWish', wishPayload), /wish_limit_reached/);
  assert.equal(requests.length, 3);
});

test('retrying an already saved wish succeeds even after the allowance is exhausted', async () => {
  responses.push(verifiedGuest, { status: 200, body: { id: 'saved-wish', guest_id: 'test-guest' } });
  assert.deepEqual(await callSupabase('addWish', wishPayload), { id: 'saved-wish' });
  assert.equal(requests.length, 2);
});

test('a request id from another invitation cannot be reused', async () => {
  responses.push(verifiedGuest, { status: 200, body: { id: 'other-wish', guest_id: 'another-guest' } });
  await assert.rejects(callSupabase('addWish', wishPayload), /invalid request id/);
});

test('database concurrency limit is preserved as a specific client error', async () => {
  responses.push(verifiedGuest, { status: 200, body: null }, { status: 200, body: [{ id: 'one' }] }, { status: 400, body: { code: 'P0001', message: 'wish_limit_reached' } });
  await assert.rejects(callSupabase('addWish', wishPayload), /wish_limit_reached/);
});

test('invalid invitations cannot read an allowance or submit a wish', async () => {
  for (const action of ['wishStatus', 'addWish']) {
    responses.push({ status: 200, body: null });
    await assert.rejects(callSupabase(action, wishPayload), /invalid invitation link/);
  }
  assert.equal(requests.length, 2);
});

const resolvedGuest = { status: 200, body: { id: 'test-guest', invite_token: '12345678' } };
const reference = encodeInviteRef('12345678');

test('reference bootstrap resolves the existing token and returns the canonical database name', async () => {
  const data = { config, guest: { id: 'test-guest', name: 'Corrected guest name' } };
  responses.push(resolvedGuest, { status: 200, body: data });
  assert.deepEqual(await callSupabase('bootstrap', { inviteKey: reference }), data);
  assert.equal(requests[0].query.invite_token, 'eq.12345678');
  assert.deepEqual(requests[1].body, { p_invite_key: 'test-guest-12345678' });
});

for (const [action, rpc, body] of [['rsvp', 'submit_rsvp', true], ['listWishes', 'public_wishes', []], ['track', 'mark_invitation_opened', true]]) {
  test(`reference ${action} uses the original invitation identity`, async () => {
    responses.push(resolvedGuest, { status: 200, body });
    await callSupabase(action, { inviteKey: reference, name: 'Guest', rsvp: 'yes', guests: 1, event: 'open' });
    assert.equal(requests[1].path, '/rest/v1/rpc/' + rpc);
    assert.equal(requests[1].body.p_invite_key, 'test-guest-12345678');
  });
}

test('new and legacy links share the same two-wish allowance', async () => {
  responses.push(resolvedGuest, verifiedGuest, { status: 200, body: null }, { status: 200, body: [{ id: 'one' }, { id: 'two' }] });
  await assert.rejects(callSupabase('addWish', { ...wishPayload, inviteKey: reference }), /wish_limit_reached/);
  assert.equal(requests[1].query.id, 'eq.test-guest');
  assert.equal(requests.at(-1).query.guest_id, 'eq.test-guest');
});

test('unknown references do not expose config or allow a write', async () => {
  for (const [action, result] of [['bootstrap', { config: null, guest: null }], ['getGuest', null]]) {
    responses.push({ status: 200, body: null });
    assert.deepEqual(await callSupabase(action, { inviteKey: reference }), result);
  }
  responses.push({ status: 200, body: null });
  await assert.rejects(callSupabase('rsvp', { inviteKey: reference }), /invalid invitation link/);
  assert.equal(requests.length, 3);
});

test('check-in accepts the new link reference without confusing it with a guest slug', async () => {
  responses.push(resolvedGuest, { status: 200, body: true });
  assert.equal(await callSupabase('checkIn', { guestId: 'ref:' + reference }), true);
  assert.deepEqual(requests[1].body, { p_guest_code: 'test-guest-12345678' });
});
