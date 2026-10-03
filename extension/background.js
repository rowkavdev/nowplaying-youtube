// Forwards the content script's playback events to the NowPlaying app on
// 127.0.0.1, with the pairing code saved on the options page. Nothing is sent
// until the extension is paired.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "nowplaying-youtube" || !sender.tab?.id) return;
  reporting.add(sender.tab.id);
  forward({ ...message.event, tabId: `t${sender.tab.id}` });
});

// Only tabs that have sent a playback event get a "stopped" when they close.
// Closing any other tab says nothing to the app. The set rebuilds itself within
// ten seconds of a worker restart, because open YouTube tabs report every 10 s.
const reporting = new Set();
chrome.tabs?.onRemoved?.addListener((tabId) => {
  if (!reporting.delete(tabId)) return;
  forward({ tabId: `t${tabId}`, state: "stopped" });
});

const tabQueues = new Map();
function forward(event) {
  const previous = tabQueues.get(event.tabId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => send(event));
  tabQueues.set(event.tabId, next);
  next.finally(() => { if (tabQueues.get(event.tabId) === next) tabQueues.delete(event.tabId); }).catch(() => {});
  return next;
}

const BRIDGE_TIMEOUT_MS = 5000;

async function send(event) {
  const { token, port } = await chrome.storage.local.get(["token", "port"]);
  if (!token) return;
  // A local app that accepts the connection and never answers would leave
  // this promise pending forever, and every later event for the tab queues
  // behind it. The deadline releases the queue and keeps event order (#24).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);
  try {
    const response = await fetch(`http://127.0.0.1:${Number(port) || 47832}/bridge/youtube`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(event),
      signal: controller.signal,
    });
    if (!response.ok) console.warn("NowPlaying bridge rejected playback event:", response.status);
  } catch {
    // App not running or timed out: nothing to do, the next tick tries again.
  } finally {
    clearTimeout(timer);
  }
}
