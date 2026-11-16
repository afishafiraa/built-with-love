import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadInvitationHtml } from '../server/invitation-html.ts';

test('localhost uses transformed Vite HTML without a build; production and remote hosts use the bundled shell', async () => {
  const originalDirectory = process.cwd();
  const originalEnvironment = process.env.VERCEL_ENV;
  const originalFetch = globalThis.fetch;
  const directory = await mkdtemp(join(tmpdir(), 'invitation-html-'));
  let requests = 0;
  try {
    process.chdir(directory);
    delete process.env.VERCEL_ENV;
    globalThis.fetch = async input => {
      assert.match(input, /^http:\/\/(localhost:3001|127\.0\.0\.1:3001|\[::1\]:3001)\/invitation-shell\.html$/);
      requests++;
      return new Response('<html><script src="/@vite/client"></script><script src="/@react-refresh"></script></html>');
    };
    for (const host of ['localhost:3001', '127.0.0.1:3001', '[::1]:3001']) {
      assert.match(await loadInvitationHtml({ headers: { host } }), /\/@vite\/client/);
    }
    assert.equal(requests, 3);
    await mkdir('dist');
    await writeFile('dist/invitation-shell.html', '<html>Production shell</html>');
    for (const host of ['example.com', 'localhost.evil.test:3001', 'localhost:3001@evil.test', undefined]) {
      assert.equal(await loadInvitationHtml({ headers: { host } }), '<html>Production shell</html>');
    }
    process.env.VERCEL_ENV = 'production';
    assert.equal(await loadInvitationHtml({ headers: { host: 'localhost:3001' } }), '<html>Production shell</html>');
    assert.equal(requests, 3);
    delete process.env.VERCEL_ENV;
    globalThis.fetch = async () => new Response('Vite unavailable', { status: 503 });
    await assert.rejects(loadInvitationHtml({ headers: { host: 'localhost:3001' } }), /development_html_unavailable/);
  } finally {
    process.chdir(originalDirectory);
    globalThis.fetch = originalFetch;
    if (originalEnvironment === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = originalEnvironment;
    await rm(directory, { recursive: true, force: true });
  }
});
