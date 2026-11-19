import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInvitationPage } from '../server/invitation-page.ts';

const html = '<html><head><title>Wedding Invitation</title><meta property="og:title" content="Wedding Invitation" /></head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>';
function response() {
  return {
    headers: {}, code: 0, body: undefined,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    end(body) { this.body = body; }
  };
}

test('published names update both titles without a rebuild and private config is omitted', async () => {
  let config = { groomName: 'Groom One', brideName: 'Bride One', bank1Acct: 'PRIVATE_ACCOUNT', guestName: 'PRIVATE_GUEST' };
  const handler = createInvitationPage({ loadHtml: async () => html, loadConfig: async () => config });
  for (const names of [['Groom One', 'Bride One'], ['Groom Two', 'Bride Two']]) {
    config = { ...config, groomName: names[0], brideName: names[1] };
    const res = response();
    await handler({ method: 'GET', headers: {} }, res);
    const title = `Wedding Invitation ${names[0]} &amp; ${names[1]}`;
    assert.equal(res.code, 200);
    assert.ok(res.body.includes(`<title>${title}</title>`));
    assert.ok(res.body.includes(`content="${title}"`));
    assert.ok(res.body.includes('/assets/app.js'));
    assert.ok(res.body.includes('<meta name="twitter:title" content="' + title + '" />'));
    assert.ok(res.body.includes('<meta property="og:image" content="https://hanif-afi.my.id/share-logo-v1.png" />'));
    assert.doesNotMatch(res.body, /PRIVATE_|og:description|og\.jpg/);
    assert.equal(res.headers['Cache-Control'], 'no-store, max-age=0');
  }
});

test('share crawlers receive an absolute logo URL on custom, preview and local domains', async () => {
  const handler = createInvitationPage({ loadHtml: async () => html, loadConfig: async () => ({ groomName: 'Groom', brideName: 'Bride' }) });
  for (const [host, origin] of [
    ['hanif-afi.my.id', 'https://hanif-afi.my.id'],
    ['invitation-test.vercel.app', 'https://invitation-test.vercel.app'],
    ['localhost:3001', 'http://localhost:3001'],
    ['bad.host/" onload="', 'https://hanif-afi.my.id']
  ]) {
    const res = response();
    await handler({ method: 'GET', headers: { host, 'user-agent': 'WhatsApp/2.24.5' } }, res);
    assert.ok(res.body.includes('<meta property="og:image" content="' + origin + '/share-logo-v1.png" />'));
    assert.ok(res.body.includes('<meta name="twitter:card" content="summary" />'));
    assert.doesNotMatch(res.body, /onload=/);
  }
});

test('names cannot inject HTML, attributes, or replacement patterns', async () => {
  const handler = createInvitationPage({ loadHtml: async () => html, loadConfig: async () => ({ groomName: '<script>"$&', brideName: "O'Neil" }) });
  const res = response();
  await handler({ method: 'GET', headers: {} }, res);
  assert.ok(res.body.includes('Wedding Invitation &lt;script&gt;&quot;$&amp; &amp; O&#39;Neil'));
  assert.doesNotMatch(res.body, /<script>"/);
});

test('missing names or unavailable database still serve the working app with a generic title', async () => {
  for (const loadConfig of [async () => null, async () => ({ groomName: ' ', brideName: 'Bride' }), async () => { throw Error('database unavailable'); }]) {
    const res = response();
    await createInvitationPage({ loadHtml: async () => html, loadConfig })({ method: 'GET', headers: {} }, res);
    assert.equal(res.code, 200);
    assert.ok(res.body.includes('<title>Wedding Invitation</title>'));
    assert.ok(res.body.includes('/assets/app.js'));
  }
});

test('HEAD has no response body and unsupported methods do not query the database', async () => {
  let reads = 0;
  const handler = createInvitationPage({ loadHtml: async () => html, loadConfig: async () => { reads++; return null; } });
  const head = response();
  await handler({ method: 'HEAD', headers: {} }, head);
  assert.equal(head.code, 200);
  assert.equal(head.body, undefined);
  const post = response();
  await handler({ method: 'POST', headers: {} }, post);
  assert.equal(post.code, 405);
  assert.equal(post.headers.Allow, 'GET, HEAD');
  assert.equal(reads, 1);
});
