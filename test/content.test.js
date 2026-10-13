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

test('a synchronous stopped send failure retries, and a stale rejection cannot trigger another stop', async () => {
  let tick, found = { state: 'playing' }, fail = 'throw', rejectStop;
  const sent = [];
  vm.runInNewContext(readFileSync(new URL('../extension/content.js', import.meta.url), 'utf8'), {
    NowPlayingReader: { readPlayback: () => found },
    document: { addEventListener() {} }, location: {}, navigator: { mediaSession: {} },
    window: { addEventListener() {} },
    chrome: { runtime: { sendMessage: ({ event }) => {
      sent.push(event.state);
      if (event.state === 'stopped' && fail === 'throw') throw new Error('worker unavailable');
      if (event.state === 'stopped' && fail === 'pending') return new Promise((_resolve, reject) => { rejectStop = reject; });
      return Promise.resolve();
    } } },
    setInterval: fn => { tick = fn; },
  });
  found = null; tick();
  fail = 'pending'; tick();
  found = { state: 'playing' }; tick();
  fail = false; found = null; tick();
  rejectStop(new Error('late failure'));
  await new Promise(resolve => setImmediate(resolve));
  tick();
  assert.deepEqual(sent, ['playing', 'stopped', 'stopped', 'playing', 'stopped']);
});

function harness(onStop) {
  let tick, found = { state: 'playing' };
  const sent = [];
  vm.runInNewContext(readFileSync(new URL('../extension/content.js', import.meta.url), 'utf8'), {
    NowPlayingReader: { readPlayback: () => found },
    document: { addEventListener() {} }, location: {}, navigator: { mediaSession: {} },
    window: { addEventListener() {} },
    chrome: { runtime: { sendMessage: ({ event }) => { sent.push(event.state); return event.state === 'stopped' ? onStop() : Promise.resolve(); } } },
    setInterval: fn => { tick = fn; },
  });
  return { sent, tick: () => tick(), set: value => { found = value; } };
}

test('a stopped send that throws synchronously is retried on the next heartbeat', () => {
  let throwing = true;
  const h = harness(() => { if (throwing) throw new Error('worker unavailable'); return Promise.resolve(); });
  h.set(null); h.tick(); throwing = false; h.tick(); h.tick();
  assert.deepEqual(h.sent, ['playing', 'stopped', 'stopped']);
});

test('a stopped send that rejects is retried, then not repeated once it succeeds', async () => {
  let rejecting = true;
  const h = harness(() => rejecting ? Promise.reject(new Error('worker unavailable')) : Promise.resolve());
  h.set(null); h.tick();
  await new Promise(resolve => setImmediate(resolve));
  rejecting = false; h.tick(); h.tick();
  assert.deepEqual(h.sent, ['playing', 'stopped', 'stopped']);
});

test('a late stop rejection after new playback does not send an extra stop', async () => {
  let reject;
  const h = harness(() => new Promise((_r, rej) => { reject = rej; }));
  h.set(null); h.tick();
  h.set({ state: 'playing' }); h.tick();
  reject(new Error('late'));
  await new Promise(resolve => setImmediate(resolve));
  h.tick();
  assert.deepEqual(h.sent, ['playing', 'stopped', 'playing', 'playing']);
});
