const form = document.getElementById("pair");
const status = document.getElementById("status");

function show(text, ok) {
  status.textContent = text;
  status.className = ok ? "ok" : "";
}

chrome.storage.local.get(["token", "port"]).then(({ token, port }) => {
  if (port) form.port.value = port;
  show(token ? "Paired." : "Not paired yet.", Boolean(token));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = form.token.value.trim();
  const port = Number(form.port.value) || 47832;
  if (token.length < 32) return show("That code is too short. Copy it again from the NowPlaying settings page.", false);
  show("Checking…", false);
  const result = await globalThis.NowPlayingPairing.checkPairing({ token, port });
  if (result === "wrong_code") return show("NowPlaying didn't accept that code. Copy it again from the settings page; it changes if you reset it.", false);
  await chrome.storage.local.set({ token, port });
  form.token.value = "";
  if (result === "paired") return show("Paired.", true);
  if (result === "app_not_running") return show(`Saved, but NowPlaying isn't answering on port ${port}. Start it and this will work.`, false);
  if (result === "old_app") return show("Saved, but this version of NowPlaying doesn't support YouTube yet. Update it.", false);
  show("Saved, but NowPlaying gave an unexpected answer. Check the port.", false);
});

document.getElementById("forget").addEventListener("click", async () => {
  await chrome.storage.local.remove(["token"]);
  show("Unpaired. Nothing is sent now.", false);
});
