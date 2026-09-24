# nowplaying-youtube

Browser extension that tells the [nowplaying](https://github.com/rowkavdev/nowplaying) app what you're watching on YouTube or YouTube Music, so it can show on your card and in Discord.

It only reports the video that is playing in a tab. It never sends page visits, searches, recommendations or history. Ads and Shorts are skipped.

## Install (load unpacked)

It isn't on the Chrome Web Store yet.

1. Download or clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the `extension` folder.
4. Open the extension's options and paste the pairing code from the nowplaying app's settings page.

## Development

```
npm test
```

Tracking issue: rowkavdev/nowplaying#136.
