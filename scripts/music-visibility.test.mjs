import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindMusicVisibility } from '../src/lib/music-visibility.ts';

function scenario(run, initiallyHidden = false) {
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
    onVisibility: value => { hidden = value; }
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
