import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('a rejected runtime message is handled and the next heartbeat still runs', async () => {
  let tick, calls = 0;
  vm.runInNewContext(readFileSync(new URL('../extension/content.js', import.meta.url), 'utf8'), {
    NowPlayingReader: { readPlayback: () => ({ state: 'playing' }) },
    document: { addEventListener() {} }, location: {}, navigator: { mediaSession: {} },
    window: { addEventListener() {} },
    chrome: { runtime: { sendMessage: () => { calls++; return Promise.reject(new Error('Extension context invalidated')); } } },
    setInterval: fn => { tick = fn; },
  });
  await new Promise(resolve => setImmediate(resolve));
  tick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
});
