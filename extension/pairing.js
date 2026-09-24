// Checks a pairing code against the NowPlaying app before saving it. Sends a
// "stopped" event for a tab that doesn't exist, which changes nothing in the
// app: 204 means the code works, 401 means it doesn't.
(function () {
  async function checkPairing({ token, port = 47832, fetchImpl = fetch } = {}) {
    let response;
    try {
      response = await fetchImpl(`http://127.0.0.1:${Number(port) || 47832}/bridge/youtube`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tabId: "pairing-check", state: "stopped" }),
      });
    } catch {
      return "app_not_running";
    }
    if (response.status === 204) return "paired";
    if (response.status === 401) return "wrong_code";
    if (response.status === 404) return "old_app";
    return "error";
  }
  globalThis.NowPlayingPairing = Object.freeze({ checkPairing });
})();
