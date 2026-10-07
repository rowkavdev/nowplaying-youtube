const form = document.getElementById("pair");
const status = document.getElementById("status");

let generation = 0;
let writes = Promise.resolve();
function write(operation) {
  const result = writes.then(operation, operation);
  writes = result.catch(() => {});
  return result;
}

function show(text, ok) {
  status.textContent = text;
  status.className = ok ? "ok" : "";
}

chrome.storage.local.get(["token", "port"]).then(({ token, port }) => {
  if (generation !== 0) return;
  if (port) form.port.value = port;
  show(token ? "Paired." : "Not paired yet.", Boolean(token));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const own = ++generation;
  const token = form.token.value.trim();
  const rawPort = form.port.value.trim() || "47832";
  const port = /^[0-9]{1,5}$/.test(rawPort) ? Number(rawPort) : NaN;
  if (token.length < 32) return show("That code is too short. Copy it again from the NowPlaying settings page.", false);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return show("That port isn't valid. Use a number from 1 to 65535; NowPlaying shows its port on the settings page.", false);
  show("Checking…", false);
  const result = await globalThis.NowPlayingPairing.checkPairing({ token, port });
  if (own !== generation) return;
  if (result === "wrong_code") return show("NowPlaying didn't accept that code. Copy it again from the settings page; it changes if you reset it.", false);
  try {
    await write(async () => { if (own === generation) await chrome.storage.local.set({ token, port }); });
  } catch {
    if (own === generation) show("Couldn't save the pairing code. Try again.", false);
    return;
  }
  if (own !== generation) return;
  form.token.value = "";
  if (result === "paired") return show("Paired.", true);
  if (result === "app_not_running") return show(`Saved, but NowPlaying isn't answering on port ${port}. Start it and this will work.`, false);
  if (result === "old_app") return show("Saved, but this version of NowPlaying doesn't support YouTube yet. Update it.", false);
  show("Saved, but NowPlaying gave an unexpected answer. Check the port.", false);
});

document.getElementById("forget").addEventListener("click", async () => {
  const own = ++generation;
  try {
    await write(() => chrome.storage.local.remove(["token"]));
  } catch {
    if (own === generation) show("Couldn't unpair. The code is still saved. Try again.", false);
    return;
  }
  if (own !== generation) return;
  show("Unpaired. Nothing is sent now.", false);
});
