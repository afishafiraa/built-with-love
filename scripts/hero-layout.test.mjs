import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lockHeroLayout } from '../src/lib/hero-layout.ts';

test('toolbar changes preserve hero height and safe inset; rotation recalculates and cleanup removes listeners', () => {
  const previousWindow = globalThis.window;
  const previousStyle = globalThis.getComputedStyle;
  const listeners = new Map();
  const properties = new Map();
  let viewportHeight = 800;
  let safeBottom = '34px';
  let reads = 0;
  globalThis.window = {
    innerWidth: 440,
    addEventListener: (event, listener) => listeners.set(event, listener),
    removeEventListener: (event, listener) => { if (listeners.get(event) === listener) listeners.delete(event); }
  };
  globalThis.getComputedStyle = () => ({ getPropertyValue: key => properties.get(key) || safeBottom });
  const hero = {
    style: { setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key) },
    getBoundingClientRect: () => { reads++; return { height: Math.max(680, Math.min(850, viewportHeight)) }; }
  };
  try {
    const cleanup = lockHeroLayout(hero);
    assert.equal(properties.get('--hero-height'), '800px');
    assert.equal(properties.get('--hero-safe-bottom'), '34px');

    viewportHeight = 900;
    safeBottom = '0px';
    listeners.get('resize')();
    assert.equal(properties.get('--hero-height'), '800px');
    assert.equal(properties.get('--hero-safe-bottom'), '34px');
    assert.equal(reads, 1);

    globalThis.window.innerWidth = 956;
    viewportHeight = 440;
    safeBottom = '21px';
    listeners.get('resize')();
    assert.equal(properties.get('--hero-height'), '680px');
    assert.equal(properties.get('--hero-safe-bottom'), '21px');

    globalThis.window.innerWidth = 440;
    viewportHeight = 800;
    safeBottom = '34px';
    listeners.get('resize')();
    assert.equal(properties.get('--hero-height'), '800px');
    assert.equal(properties.get('--hero-safe-bottom'), '34px');
    cleanup();
    assert.equal(listeners.size, 0);
    assert.equal(properties.size, 0);
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousStyle === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = previousStyle;
  }
});
