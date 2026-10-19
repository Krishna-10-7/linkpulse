# LinkPulse browser extension

Shorten links without opening the dashboard. Works in Chrome, Edge and Brave (Manifest V3).

| Entry point | What it does |
|---|---|
| Right-click a link | **Shorten link with LinkPulse** |
| Right-click the page | **Shorten this page's URL** |
| Right-click selected text | **Shorten selected URL** |
| Toolbar button | Popup pre-filled with the current tab: alias, campaign, expiry |
| `Alt+Shift+S` | Shortens the current tab and copies the link |
| Address bar: `lp` + space + URL | Shortens what you type |

The short link is copied to the clipboard and a notification confirms it. The popup also shows the QR code and your recent links.

Browsers do not let extensions add items to the address bar's own right-click menu, so the page menu, the shortcut and the `lp` keyword cover that case.

## Install

1. Download `linkpulse-extension.zip` from the dashboard (Settings → Browser extension) and unzip it, or use this folder directly.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the folder.
3. In the dashboard, go to **Settings → Access tokens** and create a token.
4. Paste the server address (for example `https://r2-d2.xyz/lk`) and the token into the extension options and press **Save and test**.

Every link made here goes through the same validation, safety checks and rate limits as the dashboard.
