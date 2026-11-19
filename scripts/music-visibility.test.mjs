import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindMusicVisibility } from '../src/lib/music-visibility.ts';

function scenario(run, initiallyHidden = false, options = {}) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const doc = new EventTarget();
  const win = new EventTarget();
  doc.hidden = initiallyHidden;
  globalThis.document = doc;
  globalThis.window = win;
  const calls = [];
  let wantsPlayback = false;
  let hidden = initiallyHidden;
  const dispose = bindMusicVisibility({
    pause: () => calls.push('pause'),
    resume: () => calls.push('resume'),
    shouldResume: () => wantsPlayback,
    onVisibility: value => { hidden = value; },
    ...options
  });
  try {
    run({
      calls, dispose, doc, win,
      intent: value => { wantsPlayback = value; },
      isHidden: () => hidden,
      visibility: value => { doc.hidden = value; doc.dispatchEvent(new Event('visibilitychange')); }
    });
  } finally {
    dispose();
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
}

test('tab and app switches pause music and resume only when visible again', () => scenario(s => {
  s.intent(true);
  s.visibility(true);
  assert.equal(s.isHidden(), true);
  s.visibility(true);
  s.visibility(false);
  assert.equal(s.isHidden(), false);
  assert.deepEqual(s.calls, ['pause', 'resume']);
}));

for (const seconds of [2, 10, 30]) {
  test(`returning after ${seconds}s retries a media session that is not ready immediately`, t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let attempts = 0;
    let running = false;
    scenario(s => {
      s.intent(true);
      s.visibility(true);
      t.mock.timers.tick(seconds * 1000);
      assert.equal(attempts, 0);
      s.visibility(false);
      assert.equal(attempts, 1);
      t.mock.timers.tick(300);
      assert.equal(attempts, 2);
      t.mock.timers.tick(700);
      assert.equal(attempts, 3);
      assert.equal(running, true);
      t.mock.timers.tick(1500);
      assert.equal(attempts, 3);
    }, false, { isPlaying: () => running, resume: () => { attempts++; running = attempts >= 3; } });
  });
}

test('blocked autoplay can recover on a real interaction without losing playback intent', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let allowed = false;
  let running = false;
  let attempts = 0;
  scenario(s => {
    s.intent(true);
    s.visibility(true);
    s.visibility(false);
    for (const delay of [300, 700, 1500]) t.mock.timers.tick(delay);
    assert.equal(attempts, 4);
    assert.equal(running, false);
    allowed = true;
    s.doc.dispatchEvent(new Event('pointerup'));
    assert.equal(running, true);
    assert.equal(attempts, 5);
    s.doc.dispatchEvent(new Event('pointerup'));
    assert.equal(attempts, 5);
  }, false, { isPlaying: () => running, resume: () => { attempts++; running = allowed; } });
});

test('backgrounding or manually pausing again cancels pending recovery', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  scenario(s => {
    s.intent(true);
    s.visibility(true);
    s.visibility(false);
    s.intent(false);
    t.mock.timers.tick(300);
    s.doc.dispatchEvent(new Event('pointerup'));
    s.win.dispatchEvent(new Event('focus'));
    assert.deepEqual(s.calls, ['pause', 'resume']);
    s.intent(true);
    s.visibility(true);
    s.visibility(false);
    s.visibility(true);
    t.mock.timers.tick(10000);
    assert.deepEqual(s.calls, ['pause', 'resume', 'pause', 'resume', 'pause']);
  });
});

test('manual pause and unopened invitations never auto-start on return', () => scenario(s => {
  s.visibility(true);
  s.visibility(false);
  s.intent(true);
  s.visibility(true);
  s.intent(false);
  s.visibility(false);
  assert.deepEqual(s.calls, ['pause', 'pause']);
}));

test('page navigation and back-forward restoration preserve the visibility gate', () => scenario(s => {
  s.intent(true);
  s.win.dispatchEvent(new Event('pagehide'));
  assert.equal(s.isHidden(), true);
  s.visibility(true);
  s.win.dispatchEvent(new Event('pageshow'));
  assert.deepEqual(s.calls, ['pause']);
  s.visibility(false);
  assert.deepEqual(s.calls, ['pause', 'resume']);
}));

test('hero starting in a background tab waits until the guest returns', () => scenario(s => {
  assert.equal(s.isHidden(), true);
  s.intent(true);
  s.visibility(false);
  assert.deepEqual(s.calls, ['pause', 'resume']);
}, true));

test('unmounted pages remove their playback listeners', () => scenario(s => {
  s.intent(true);
  s.dispose();
  s.visibility(true);
  s.win.dispatchEvent(new Event('pagehide'));
  s.visibility(false);
  s.win.dispatchEvent(new Event('pageshow'));
  assert.deepEqual(s.calls, []);
}));
