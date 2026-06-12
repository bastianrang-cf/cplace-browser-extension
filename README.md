# cplace power user extension

[![Version](https://img.shields.io/github/v/release/bastianrang-cf/cplace-browser-extension)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![CI](https://github.com/bastianrang-cf/cplace-browser-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/bastianrang-cf/cplace-browser-extension/actions/workflows/ci.yml)
[![Chrome Web Store Version](https://img.shields.io/chrome-web-store/v/aoeebikkhdfloboepjfbjlacpmhmkpeh)](https://chromewebstore.google.com/detail/cplace-browser-extension/aoeebikkhdfloboepjfbjlacpmhmkpeh)


A Chrome / Edge / Firefox extension for [cplace](https://cplace.com) solutions - not officially supported by [cplace](https://www.cplace.com/).

**Core behavior:** detects whether the current page is a cplace application (by the presence of `id="cplace"` in the DOM) and enables the toolbar icon on cplace pages (disabling/greying it out on all other pages). Optional behaviors are implemented as toggleable **modules**.

---

## Modules

| Module | Default | Description |
|---|---|---|
| Batch Jobs overlay | off | Shows a live overlay of running batch jobs on every cplace page, polling every 15 s while the tab is visible |
| Domain CSS injection | off | Inject custom CSS on cplace pages matching a hostname/path glob — environment labels (DEV/TEST badges), admin-access highlighting, per-tenant visuals. Ships with a default admin-border rule. |
| Language Switcher | off | Switch the cplace display language from the extension popup |
| Low-Code Logs toasts | off | Toast notifications for new low-code log entries on cplace pages, with per-field include/exclude filters |
| Navigation Links | on | Adds a popup submenu with quick links to common cplace pages (Workspaces, Packages, Batch Jobs, Low-Code Dashboard, Low-Code Logs, API Tokens, AI Settings, Deleted Items, Activity Stream, My Drafts). Each link can be individually toggled in the module options. |
| Show system version as badge | on | Displays the detected cplace version number as a badge on the toolbar icon |
| System Information | off | Adds a "System Info" popup button that fetches the tenant's system info and shows it in a dialog |

Enable or disable modules on the **Options** page (`chrome://extensions` → cplace → Details → Extension options).

---

## Snoozing modules during a presentation

The popup has a **Snooze** menu for quickly silencing the page-modifying modules
(**Batch Jobs overlay**, **Low-Code Logs toasts**, **Domain CSS injection**) on the
tenant you're currently viewing — handy during a live demo or screen share.

Each module is a tri-state toggle that cycles **Active → Snoozed → Off**:

- **Snoozed** — hidden for this tenant; **auto-reactivates after 1 day** (the row shows
  the time it will return).
- **Off** (soft deactivate) — stays hidden for this tenant until you turn it back on.

When more than one snoozable module is enabled, a **Snooze all** row sets them together.
The state is keyed by tenant (origin + path) and **propagates automatically to every
open tab/window** showing that tenant, so you only have to set it once.

---

## First-run setup: page access

The extension asks for page access **on demand** rather than at install time. After installing, the options page opens automatically with an **Enable on all pages** button — click it once and confirm Chrome's prompt to let the extension detect cplace on the sites you visit. Until you do, the toolbar icon stays inactive and the modules cannot run. You can revoke access at any time from the same options panel.

---

## Installation

### From the Chrome Web Store

Install directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/cplace-browser-extension/aoeebikkhdfloboepjfbjlacpmhmkpeh) — works in Chrome and Edge.

### :wrench: Install in 1 Minute (zip from Release)

1. Download the latest `.zip` for your browser from the [Releases page](https://github.com/bastianrang-cf/cplace-browser-extension/releases).
2. Open your browser's extension page — `chrome://extensions/` in Chrome, `edge://extensions/` in Edge.
3. Enable **Developer mode**.
4. Drag and drop the downloaded `.zip` file onto the extensions page.
5. Open the extension **Options** to enable the features you want.

---

## Development

**Prerequisites:** Node 22+, npm.

```bash
npm install            # install dev dependencies
npm run dev            # dev build with HMR — load .output/chrome-mv3/ as unpacked
npm run build          # production build
npm run package        # zip for all targets (Chrome, Firefox, Safari)
npm test               # run the Vitest test suite
npm run test:watch     # run tests in watch mode
```

Point Chrome/Edge at `.output/chrome-mv3/` when loading unpacked.

WXT generates `manifest.json` from `wxt.config.js` — do not create one manually.

---

## Architecture

### Core detection

`entrypoints/content.js` checks for `#cplace` on page load and via a debounced `MutationObserver` (250 ms), so it works correctly on single-page applications. It messages `entrypoints/background.js`, which calls `browser.action.setIcon()` per-tab and shows/hides the popup accordingly. The same detection also **gates feature-module activation**: modules only run on cplace pages, and the core reverts them automatically if `#cplace` disappears.

### Module system

Each module lives in `features/<id>/index.js` and exports a descriptor:

```js
export default {
  id: 'my-module',
  name: 'My Module',
  description: 'What it does.',
  defaultEnabled: false,
  snoozable: true,  // optional — show in the popup Snooze menu (per-tenant snooze / soft-deactivate)
  css: true,        // optional — auto-injects features/<id>/module.css
  pageScript: true, // optional — auto-injects features/<id>/page.js
  apply()  { /* optional — activate beyond asset injection; must be idempotent. Only called on cplace pages. */ },
  revert() { /* optional — undo apply exactly. Called on disable or when #cplace disappears. */ },
};
```

`features/registry.js` auto-discovers all `features/*/index.js` files. The background seeds the typed storage items (`enabledModulesItem`, `moduleOptionsItem` from `features/storage.js`, backed by `local:` storage) on first install. The content script reads them, gates activation on `#cplace` detection, calls `apply()` / `revert()` accordingly, and listens for live `cplace:moduleToggle` messages broadcast by the background when settings change. Features should **not** add their own `MutationObserver` or `#cplace` check — the core already does that.

### Adding a new module

1. Create `features/<id>/` containing `index.js` with the descriptor shape above. Optionally add `module.css` (declare `css: true`), `page.js` for page-world logic (declare `pageScript: true`), and `index.test.js`.
2. **Update the Modules table in this README** to reflect the new module's name, default, and description.

The registry auto-discovers the new module — no other files need to change.

### CSP-safe asset injection

Content scripts run in an isolated world. The framework handles two kinds of extension-origin assets automatically — no `unsafe-inline` needed, no `wxt.config.js` changes required:

**CSS** (`features/<id>/module.css` + `css: true`): the framework injects a `<link>` pointing at `<id>-module.css` on apply and removes it on revert.

**Page-world scripts** (`features/<id>/page.js` + `pageScript: true`): use this when a module needs page-level globals (e.g. `jQuery`, `_cplace_languages_`). The framework calls WXT's `injectScript()` for `<id>-page.js` on apply and removes the `<script>` element on revert.

A WXT build module at `modules/cplace-features.js` stages flattened, renamed feature assets into the extension output (`<id>-page.js`, `<id>-module.css`, plus any `<id>-*.svg`/`.png`). `web_accessible_resources` already covers `*-module.css` and `*-page.js` — no `wxt.config.js` changes required.

---

## Release pipeline

Releases are driven by [release-please](https://github.com/googleapis/release-please). Commits to `main` must follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.). On merge of the release PR, GitHub Actions builds and uploads `.zip` files for Chrome, Firefox, and Safari to the GitHub Release.

When the `CHROME_CLIENT_ID` repository variable is set, the workflow also submits the Chrome zip to the Chrome Web Store via `wxt submit`, authenticating with these repository secrets/variables:

| Name | Type | Purpose |
|------|------|---------|
| `CHROME_EXTENSION_ID` | Variable | Target extension ID in the store |
| `CHROME_CLIENT_ID` | Variable | Google OAuth client ID |
| `CHROME_CLIENT_SECRET` | Secret | Google OAuth client secret |
| `CHROME_REFRESH_TOKEN` | Secret | Google OAuth refresh token |

### Refreshing the Chrome Web Store token

If the submit step fails with `invalid_grant` / `Token has been expired or revoked`, the `CHROME_REFRESH_TOKEN` has lapsed. Refresh tokens expire after 7 days while the OAuth consent screen is in **Testing** — set it to **In production** in the [Google Cloud Console](https://console.cloud.google.com/auth/audience) to stop that.

`wxt submit init` no longer works because Google disabled its out-of-band OAuth flow. Generate a new token with the helper script instead (loopback flow, works with the existing "Desktop app" client):

```bash
CHROME_CLIENT_ID="<client id>" \
CHROME_CLIENT_SECRET="<client secret>" \
node scripts/get-chrome-token.mjs
```

It opens a browser for sign-in and prints a fresh refresh token. Save it as the `CHROME_REFRESH_TOKEN` secret, then re-run the failed release job.

---

## License

MIT — see [LICENSE](LICENSE).
