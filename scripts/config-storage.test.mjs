import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';

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
  requests.push({ path: url.pathname, method: options?.method, body: options?.body ? JSON.parse(options.body) : null });
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
