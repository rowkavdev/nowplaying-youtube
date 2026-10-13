// Runs on youtube.com and music.youtube.com. Reports the active player to the
// extension's background worker while something is playing (every 10 s and
// on play/pause), and says "stopped" when it ends or the tab goes away.
(function () {
  const reader = globalThis.NowPlayingReader;
  let last = null;
  let sequence = 0;

  function send(event, onFailure) {
    const own = ++sequence;
    const failed = () => { if (own === sequence) onFailure?.(); };
    try {
      const pending = chrome.runtime.sendMessage({ type: "nowplaying-youtube", event });
      pending?.catch(failed);
    } catch { failed(); }
  }

  function report() {
    const found = reader.readPlayback(document, location, navigator.mediaSession);
    if (!found || found.skip) {
      const needsStop = last && last !== "stopped";
      last = "stopped";
      if (needsStop) send({ state: "stopped" }, () => { last = "retry-stop"; });
      return;
    }
    // Paused tabs need the same heartbeat to stay alive at the bridge.
    send(found);
    last = found.state;
  }

  document.addEventListener("play", report, true);
  document.addEventListener("pause", report, true);
  document.addEventListener("ended", report, true);
  window.addEventListener("pagehide", () => send({ state: "stopped" }));
  setInterval(report, 10_000);
  report();
})();
