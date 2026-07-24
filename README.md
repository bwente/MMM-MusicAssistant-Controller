# MMM-MusicAssistant-Controller

A compact, touch-friendly [MagicMirror²](https://magicmirror.builders/) module for controlling
[Music Assistant](https://www.music-assistant.io/) directly. It displays the active queue,
provides large playback controls, switches between players, and launches configured playlists.

It does not require Home Assistant, embed the Music Assistant web app, or depend on another
MagicMirror module.

## Requirements

- MagicMirror²
- Music Assistant 2.9 or newer
- A Music Assistant long-lived access token
- A browser that can reach the Music Assistant server

## Installation

From the MagicMirror `modules` directory:

```sh
git clone https://github.com/your-account/MMM-MusicAssistant-Controller.git
cd MMM-MusicAssistant-Controller
npm test
```

This module has no production npm dependencies.

## Authentication

Keep the token outside the public module and MagicMirror configuration. Copy
`token.example.js` to a private location:

```js
"use strict";

module.exports = {
  token: "replace-with-a-music-assistant-long-lived-token"
};
```

Restrict the file so only the account running MagicMirror can read it:

```sh
chmod 600 /absolute/private/path/music-assistant-token.js
```

`tokenFile` must be an absolute path. The token is loaded by the node helper, passed only to
this module instance, and used in the WebSocket `auth` command. The module never writes it to
logs, the DOM, local storage, or a URL. Do not place a real token in this repository.

## Configuration

Add the module to `config/config.js`:

```js
{
  module: "MMM-MusicAssistant-Controller",
  position: "fullscreen_above",
  config: {
    serverUrl: "http://music-assistant.local:8095",
    tokenFile: "/absolute/private/path/music-assistant-token.js",
    playerId: "explicit-player-id",
    volumeStep: 5,
    playlists: [
      {
        label: "Focus",
        uri: "library://playlist/1",
        icon: "bullseye"
      },
      {
        label: "Relax",
        uri: "library://playlist/2",
        icon: "couch"
      },
      {
        label: "News",
        uri: "library://playlist/3",
        icon: "newspaper"
      },
      {
        label: "Party",
        uri: "library://playlist/4",
        icon: "music"
      },
      {
        label: "Radio",
        uri: "library://playlist/5",
        icon: "radio"
      }
    ]
  }
}
```

The addresses, player ID, and playlist IDs above are examples only.

### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `serverUrl` | string | `http://music-assistant.local:8095` | Music Assistant HTTP(S) base URL. |
| `tokenFile` | string | empty | Required absolute path to the private CommonJS token file. |
| `playerId` | string | empty | Preferred exact Music Assistant player ID. |
| `volumeStep` | number | `5` | Percentage-point change for volume up/down. |
| `playlists` | array | `[]` | Launcher tiles; each accepts `label`, `uri`, `icon`, or `cover`. |
| `reconnectBaseDelay` | number | `1000` | Initial reconnect delay in milliseconds. |
| `reconnectMaxDelay` | number | `30000` | Maximum reconnect delay in milliseconds. |

An exact configured `playerId` wins. Otherwise, the module restores the last locally selected
player and then falls back to the first available player. Player names are display-only and are
never used for resolution.

`icon` is a Font Awesome icon name without the `fa-` prefix. `cover` can be an image URL or a
MagicMirror-served image path. A tile uses `player_queues/play_media` with the selected player ID
as the queue and replaces the current queue.

## Input and notifications

All controls support touch, mouse, Tab, Enter, Space, arrow keys, and Escape. Focus is only
claimed after this interface receives navigation input, so normal page navigation and other
modules retain focus otherwise.

External modules can send:

| Notification | Action |
| --- | --- |
| `MUSIC_CONTROL_UP`, `MUSIC_CONTROL_LEFT` | Move focus backward |
| `MUSIC_CONTROL_DOWN`, `MUSIC_CONTROL_RIGHT` | Move focus forward |
| `MUSIC_CONTROL_SELECT` | Activate the focused control |
| `MUSIC_CONTROL_BACK` | Close player selection or release encoder focus |
| `MUSIC_PLAY_PAUSE` | Toggle playback |
| `MUSIC_NEXT` | Next item |
| `MUSIC_PREVIOUS` | Previous item |
| `MUSIC_VOLUME_UP` | Raise volume by `volumeStep` |
| `MUSIC_VOLUME_DOWN` | Lower volume by `volumeStep` |

For example:

```js
this.sendNotification("MUSIC_CONTROL_RIGHT");
this.sendNotification("MUSIC_CONTROL_SELECT");
```

No GPIO or device-specific code is included.

## Connection behavior

The module connects to `ws://…/ws` or `wss://…/ws`, waits for server information, authenticates,
and retrieves `players/all` and `player_queues/all`. Music Assistant events update the existing
DOM rather than rebuilding it. Connection failures use capped exponential backoff with jitter.
The status line distinguishes connecting, reconnecting, disconnected, and error states.

If MagicMirror is served over HTTPS, Music Assistant should also be served over HTTPS so the
browser permits the secure WebSocket connection. Ensure Music Assistant permits the MagicMirror
origin and that both the Electron renderer and browser clients can resolve the configured host.

Artwork uses Music Assistant's image proxy. Browsers cache image responses normally; no
additional disk cache is maintained by default.

## Layout and performance

The default layout fits a 1024×600 fullscreen region without scrolling with five playlist tiles.
At narrower widths, tiles wrap to three columns. The module uses no backdrop filters, masks,
blur, canvas, iframe, animation loop, or GPU-heavy effect. A one-second timer changes only the
progress elements.

If many playlist tiles are configured, available vertical space may be exceeded. Five tiles are
recommended for a 1024×600 display.

## Testing

```sh
npm test
```

The dependency-free Node test suite covers command construction, player resolution, state
normalization, server events, progress events, reconnection delay, WebSocket authentication,
pending-command failure, and notification mapping.

For a live smoke test:

1. Start MagicMirror and confirm the status becomes connected.
2. Select each player and reload MagicMirror to verify persistence.
3. Start playback outside MagicMirror and confirm metadata and controls synchronize.
4. Disconnect the Music Assistant host temporarily; confirm the reconnecting status and recovery.
5. Exercise touch, mouse, keyboard, and any external notification controller.

## Troubleshooting

- **Authentication error:** create a new long-lived token and verify the private file exports
  either `{ token: "…" }` or the token string itself.
- **No players:** verify players are enabled and available in Music Assistant. Prefer an exact
  `playerId`.
- **Artwork missing:** verify the browser can load the Music Assistant HTTP URL directly.
- **Connection repeatedly restarts:** check hostname resolution, firewall rules, HTTPS mixed
  content, and Music Assistant logs. The token is deliberately omitted from module logs.

Music Assistant exposes generated API documentation at `http://YOUR_MA_SERVER:8095/api-docs`.
Its public [API overview](https://www.music-assistant.io/api/) and official frontend client are
the protocol references used by this module.

## License

[MIT](LICENSE)
