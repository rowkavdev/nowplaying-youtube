import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const dir = new URL("../extension/", import.meta.url);
const context = vm.createContext({ URL });
vm.runInContext(readFileSync(new URL("reader.js", dir), "utf8"), context);
const { readPlayback } = context.NowPlayingReader;

function page({ href = "https://www.youtube.com/watch?v=dQw4w9WgXcQ", paused = false, duration = 212, currentTime = 30, ad = false, live = false, video = true } = {}) {
  const url = new URL(href);
  const nodes = {
    video: video ? { paused, ended: false, duration, currentTime } : null,
    player: { classList: { contains: (name) => ad && name === "ad-showing" } },
    live: live ? { offsetParent: {} } : null,
  };
  const doc = { querySelector: (selector) => selector.includes("video") ? nodes.video : selector === "#movie_player" ? nodes.player : selector === ".ytp-live-badge" ? nodes.live : null };
  const location = { href, pathname: url.pathname, hostname: url.hostname };
  const mediaSession = { metadata: { title: " Never Gonna Give You Up ", artist: "Rick Astley", artwork: [
    { src: "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg", sizes: "120x90" },
    { src: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", sizes: "480x360" },
  ] } };
  return [doc, location, mediaSession];
}

test("reads the active YouTube player (#136)", () => {
  const e = readPlayback(...page());
  assert.equal(e.videoId, "dQw4w9WgXcQ");
  assert.equal(e.title, "Never Gonna Give You Up");
  assert.equal(e.channel, "Rick Astley");
  assert.equal(e.thumbnail, "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  assert.equal(e.positionMs, 30_000);
  assert.equal(e.durationMs, 212_000);
  assert.equal(e.state, "playing");
  assert.equal(e.music, false);
  assert.equal(readPlayback(...page({ paused: true })).state, "paused");
  assert.equal(readPlayback(...page({ href: "https://music.youtube.com/watch?v=dQw4w9WgXcQ" })).music, true);
});

test("ads, Shorts, live and non-watch pages", () => {
  assert.equal(readPlayback(...page({ ad: true })).skip, "ad");
  assert.equal(readPlayback(...page({ href: "https://www.youtube.com/shorts/dQw4w9WgXcQ" })).skip, "shorts");
  const live = readPlayback(...page({ live: true }));
  assert.equal(live.live, true);
  assert.equal(live.positionMs, null);
  assert.equal(readPlayback(...page({ duration: Infinity })).live, true);
  assert.equal(readPlayback(...page({ href: "https://www.youtube.com/results?search_query=x" })), null);
  assert.equal(readPlayback(...page({ video: false })), null);
});

test("the manifest asks only for YouTube, 127.0.0.1 and storage", () => {
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions, ["http://127.0.0.1/*"]);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://www.youtube.com/*", "https://music.youtube.com/*"]);
});

// The app checks every event against this key list (EVENT_KEYS in
// rowkavdev/nowplaying src/youtube-bridge.js). Keep the two in step.
const BRIDGE_KEYS = ["tabId", "videoId", "title", "channel", "thumbnail", "positionMs", "durationMs", "state", "live", "music", "ad", "shorts"];

test("events the extension builds only use keys the app's bridge accepts", () => {
  const e = { ...readPlayback(...page()), tabId: "t12" };
  assert.deepEqual(Object.keys(e).filter((key) => !BRIDGE_KEYS.includes(key)), []);
  assert.match(e.videoId, /^[A-Za-z0-9_-]{11}$/);
  assert.ok(["playing", "paused", "stopped"].includes(e.state));
});

test("pairing check tells a working code from a wrong one (#136)", async () => {
  const ctx = vm.createContext({ URL, JSON, AbortController, setTimeout, clearTimeout });
  vm.runInContext(readFileSync(new URL("pairing.js", dir), "utf8"), ctx);
  const { checkPairing } = ctx.NowPlayingPairing;
  const sent = [];
  const reply = (status) => async (url, init) => { sent.push([url, init]); return { status }; };
  assert.equal(await checkPairing({ token: "x".repeat(40), port: 47832, fetchImpl: reply(204) }), "paired");
  assert.equal(sent[0][0], "http://127.0.0.1:47832/bridge/youtube");
  assert.equal(sent[0][1].headers.Authorization, `Bearer ${"x".repeat(40)}`);
  assert.deepEqual(JSON.parse(sent[0][1].body), { tabId: "pairing-check", state: "stopped" });
  assert.equal(await checkPairing({ token: "x".repeat(40), fetchImpl: reply(401) }), "wrong_code");
  assert.equal(await checkPairing({ token: "x".repeat(40), fetchImpl: reply(404) }), "old_app");
  assert.equal(await checkPairing({ token: "x".repeat(40), fetchImpl: async () => { throw new TypeError("refused"); } }), "app_not_running");
});

test('background warns on bridge rejection without logging token or playback', async () => {
  const warnings = [];
  let listener;
  const context = {
    chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } } }, storage: { local: { get: async () => ({ token: 'private-pairing-token', port: 47832 }) } } },
    fetch: async () => ({ ok: false, status: 400 }),
    console: { warn: (...args) => warnings.push(args) },
    AbortController, setTimeout, clearTimeout,
  };
  vm.runInNewContext(readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8'), context);
  listener({ type: 'nowplaying-youtube', event: { state: 'playing', title: 'Private title' } }, { tab: { id: 1 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(warnings, [['NowPlaying bridge rejected playback event:', 400]]);
  assert.equal(JSON.stringify(warnings).includes('private'), false);
});

test('Unpair wins a pending Save/check and serialized storage writes (#13)', async () => {
  const handlers = {}; let finish; const checked = new Promise(resolve => { finish = resolve; });
  let stored = null;
  const form = { token: { value: 't'.repeat(40) }, port: { value: '47832' }, addEventListener: (kind, fn) => { handlers[kind] = fn; } };
  const status = {};
  const context = { document: { getElementById: id => id === 'pair' ? form : id === 'status' ? status : { addEventListener: (_kind, fn) => { handlers.forget = fn; } } }, chrome: { storage: { local: { get: async () => ({}), set: async value => { stored = value; }, remove: async () => { stored = null; } } } }, NowPlayingPairing: { checkPairing: () => checked } };
  vm.runInNewContext(readFileSync(new URL('options.js', dir), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  const saving = handlers.submit({ preventDefault() {} });
  await handlers.forget(); finish('paired'); await saving;
  assert.equal(stored, null);
  assert.equal(status.textContent, 'Unpaired. Nothing is sent now.');
});

test('Unpair also waits out an already pending token storage write (#13)', async () => {
  const handlers = {}; let release, began; const writing = new Promise(resolve => { began = resolve; }); const gate = new Promise(resolve => { release = resolve; });
  let stored;
  const form = { token: { value: 't'.repeat(40) }, port: { value: '47832' }, addEventListener: (kind, fn) => { handlers[kind] = fn; } }, status = {};
  vm.runInNewContext(readFileSync(new URL('options.js', dir), 'utf8'), { document: { getElementById: id => id === 'pair' ? form : id === 'status' ? status : { addEventListener: (_kind, fn) => { handlers.forget = fn; } } }, chrome: { storage: { local: { get: async () => ({}), set: async value => { began(); await gate; stored = value; }, remove: async () => { stored = null; } } } }, NowPlayingPairing: { checkPairing: async () => 'paired' } });
  await new Promise(resolve => setImmediate(resolve));
  const saving = handlers.submit({ preventDefault() {} }); await writing;
  const forgetting = handlers.forget(); release(); await Promise.all([saving, forgetting]);
  assert.equal(stored, null); assert.equal(status.textContent, 'Unpaired. Nothing is sent now.');
});

test('per-tab forwarding keeps a late old play ahead of close, never revives after stop (#14)', async () => {
  let message, removed;
  const reads = [], sends = [];
  vm.runInNewContext(readFileSync(new URL('background.js', dir), 'utf8'), {
    chrome: { runtime: { onMessage: { addListener: fn => { message = fn; } } }, tabs: { onRemoved: { addListener: fn => { removed = fn; } } }, storage: { local: { get: () => new Promise(resolve => reads.push(resolve)) } } },
    fetch: async (_url, options) => { sends.push(JSON.parse(options.body)); return { ok: true }; }, console,
    AbortController, setTimeout, clearTimeout,
  });
  message({ type: 'nowplaying-youtube', event: { state: 'playing' } }, { tab: { id: 7 } }); removed(7);
  await new Promise(resolve => setImmediate(resolve));
  if (reads.length === 2) { reads[1]({ token: 't' }); await new Promise(resolve => setImmediate(resolve)); }
  reads[0]({ token: 't' }); await new Promise(resolve => setImmediate(resolve));
  if (reads.length === 2) reads[1]({ token: 't' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sends.at(-1).state, 'stopped');
});

test('naturally ended video reports stopped, explicit pause stays paused (#15)', () => {
  const args = page({ paused: true });
  args[0].querySelector('video').ended = true;
  assert.equal(readPlayback(...args).state, 'stopped');
  assert.equal(readPlayback(...page({ paused: true })).state, 'paused');
});

test('open paused tab sends heartbeat every ten seconds (#12)', () => {
  const sent = []; let tick;
  vm.runInNewContext(readFileSync(new URL('content.js', dir), 'utf8'), {
    NowPlayingReader: { readPlayback: () => ({ state: 'paused', videoId: 'dQw4w9WgXcQ', title: 'Paused' }) },
    document: { addEventListener() {} }, location: {}, navigator: { mediaSession: {} }, window: { addEventListener() {} },
    chrome: { runtime: { sendMessage: event => sent.push(event) } }, setInterval: fn => { tick = fn; },
  });
  for (let i = 0; i < 4; i++) tick();
  assert.equal(sent.length, 5);
  assert.ok(sent.every(message => message.event.state === 'paused'));
});

test('unloaded media metadata is not reported as a live stream', () => {
  const event = readPlayback(...page({ duration: NaN, currentTime: NaN }));
  assert.equal(event.live, false);
  assert.equal(event.durationMs, null);
  assert.equal(event.positionMs, null);
  const live = readPlayback(...page({ duration: Infinity }));
  assert.equal(live.live, true);
});

test('a hung bridge request times out so later tab events still send (#24)', async () => {
  let message, removed;
  const sends = [];
  vm.runInNewContext(readFileSync(new URL('background.js', dir), 'utf8'), {
    chrome: { runtime: { onMessage: { addListener: fn => { message = fn; } } }, tabs: { onRemoved: { addListener: fn => { removed = fn; } } }, storage: { local: { get: async () => ({ token: 't' }) } } },
    fetch: (_url, options) => {
      const event = JSON.parse(options.body);
      sends.push(event.state);
      if (sends.length > 1) return Promise.resolve({ ok: true });
      return new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    },
    console, AbortController,
    // Shrink the 5 second deadline so the test does not wait for it.
    setTimeout: (fn, ms) => { assert.equal(ms, 5000); return setTimeout(fn, 10); },
    clearTimeout,
  });
  message({ type: 'nowplaying-youtube', event: { state: 'playing' } }, { tab: { id: 7 } });
  removed(7);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual(sends, ['playing', 'stopped']);
});

test('pairing check times out when the app never answers (#27)', async () => {
  let abort;
  const cleared = [];
  const ctx = vm.createContext({ AbortController, setTimeout: fn => { abort = fn; return 1; }, clearTimeout: id => cleared.push(id) });
  vm.runInContext(readFileSync(new URL('pairing.js', dir), 'utf8'), ctx);
  const checking = ctx.NowPlayingPairing.checkPairing({
    token: 't'.repeat(40),
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })),
  });
  abort();
  assert.equal(await checking, 'app_not_running');
  assert.deepEqual(cleared, [1]);
});

test("the manifest's icons exist as PNGs at the declared sizes", () => {
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8"));
  assert.deepEqual(Object.keys(manifest.icons).sort(), ["128", "16", "32", "48"]);
  for (const [size, path] of Object.entries(manifest.icons)) {
    const png = readFileSync(new URL(path, dir));
    assert.equal(png.subarray(1, 4).toString(), "PNG", path);
    assert.equal(png.readUInt32BE(16), Number(size), `${path} width`);
    assert.equal(png.readUInt32BE(20), Number(size), `${path} height`);
  }
  for (const path of Object.values(manifest.action.default_icon)) assert.ok(Object.values(manifest.icons).includes(path), path);
});

test("PRIVACY.md names every field the extension sends", () => {
  const privacy = readFileSync(new URL("../PRIVACY.md", import.meta.url), "utf8").toLowerCase();
  const sent = readPlayback(...page());
  const words = { videoId: "video id", title: "title", channel: "channel", thumbnail: "thumbnail", positionMs: "position", durationMs: "duration", state: "paused", live: "live", music: "youtube music" };
  assert.deepEqual(Object.keys(sent).sort(), Object.keys(words).sort(), "a new sent field needs a line in PRIVACY.md and here");
  for (const [field, phrase] of Object.entries(words)) assert.ok(privacy.includes(phrase), `${field}: PRIVACY.md should mention "${phrase}"`);
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", dir), "utf8"));
  for (const permission of [...manifest.permissions, ...manifest.host_permissions]) assert.ok(privacy.includes(permission), permission);
});
