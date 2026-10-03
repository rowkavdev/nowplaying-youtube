# Privacy

NowPlaying for YouTube reads the video that is playing in a YouTube or YouTube Music tab and tells the NowPlaying app on your own computer. That is all it does.

## What it sends

For the playing video only:

- video ID
- title
- channel (the uploader or artist shown by the player)
- thumbnail URL
- playback position and duration
- whether it is playing, paused or live
- whether the tab is YouTube Music

## Where it goes

Only to `http://127.0.0.1` (your own machine), on the port set in the extension options (47832 by default), with the pairing code you entered. Nothing is sent to the developer, to Google or to any other server.

## What it does not do

It does not read or send page visits, searches, recommendations, watch history, cookies, account details or anything from tabs that are not playing a video. It does not run analytics or ad tracking. Ads and Shorts are skipped.

## What it stores

The pairing code and port, in the browser's local extension storage on your computer. Unpair on the options page removes the pairing code and keeps the port, so pairing again doesn't need it re-entered. Removing the extension clears both.

## Permissions

- `storage`: keeps the pairing code and port.
- `http://127.0.0.1/*`: lets the extension reach the NowPlaying app on your machine.
- Content script on `youtube.com` and `music.youtube.com`: reads the player in those pages.
