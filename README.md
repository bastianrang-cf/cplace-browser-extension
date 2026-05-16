# cplace browser extension

[![Version](https://img.shields.io/badge/version-0.10.0)](CHANGELOG.md) <!-- x-release-please-version -->
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![CI](https://github.com/bastianrang-cf/cplace-browser-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/bastianrang-cf/cplace-browser-extension/actions/workflows/ci.yml)

A Chrome / Edge / Firefox extension for [cplace](https://cplace.com) solutions.

**Core behavior:** detects whether the current page is a cplace application (by the presence of `id="cplace"` in the DOM) and enables the toolbar icon on cplace pages (disabling/greying it out on all other pages). Optional behaviors are implemented as toggleable **modules**.

---

## Modules

| Module | Default | Description |
|---|---|---|
| Admin access highlight | off | Shows a red page border when the logged-in user has cplace admin access |
| Batch Jobs overlay | off | Shows a live overlay of running batch jobs on every cplace page, polling every 15 s while the tab is visible |
| Language Switcher | off | Switch the cplace display language from the extension popup |
| Show system version as badge | on | Displays the detected cplace version number as a badge on the toolbar icon |
| System Information | off | Adds a "System Info" popup button that fetches the tenant's system info and shows it in a dialog |

Enable or disable modules on the **Options** page (`chrome://extensions` → cplace → Details → Extension options).

---

## Installation

### From the Chrome Web Store / Edge Add-ons store

> Not yet published — load manually (see below).

### Manual (unpacked)

1. Clone this repo and run `npm install && npm run build`.
2. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge) and enable **Developer mode**.
3. Click **Load unpacked** and select the `.output/chrome-mv3/` directory.

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

`entrypoints/content.js` checks for `#cplace` on page load and via a debounced `MutationObserver` (250 ms), so it works correctly on single-page applications. It messages `entrypoints/background.js`, which calls `browser.action.setIcon()` per-tab and shows/hides the popup accordingly.

### Module system

Each module lives in `modules/<id>/index.js` and exports a descriptor:

```js
export default {
  id: 'my-module',
  name: 'My Module',
  description: 'What it does.',
  defaultEnabled: false,
  css: true,        // optional — auto-injects modules/<id>/module.css
  pageScript: true, // optional — auto-injects modules/<id>/page.js
  apply()  { /* optional — activate beyond asset injection; must be idempotent */ },
  revert() { /* optional — undo apply exactly */ },
};
```

`modules/registry.js` auto-discovers all `modules/*/index.js` files. The background seeds `browser.storage.local` on first install. The content script reads storage, calls `apply()` / `revert()` on toggles, and listens for live `cplace:moduleToggle` messages broadcast by the background when settings change.

### Adding a new module

1. Create `modules/<id>/` containing `index.js` with the descriptor shape above. Optionally add `module.css` (declare `css: true`), `page.js` for page-world logic (declare `pageScript: true`), and `index.test.js`.
2. **Update the Modules table in this README** to reflect the new module's name, default, and description.

The registry auto-discovers the new module — no other files need to change.

### CSP-safe asset injection

Content scripts run in an isolated world. The framework handles two kinds of extension-origin assets automatically — no `unsafe-inline` needed, no `wxt.config.js` changes required:

**CSS** (`modules/<id>/module.css` + `css: true`): the framework injects a `<link>` pointing at `<id>-module.css` on apply and removes it on revert.

**Page-world scripts** (`modules/<id>/page.js` + `pageScript: true`): use this when a module needs page-level globals (e.g. `jQuery`, `_cplace_languages_`). The framework injects a `<script src="<id>-page.js">` on apply and removes it on revert.

The build copies each `modules/<id>/module.css` and `modules/<id>/page.js` to the extension root; `web_accessible_resources` already covers `*-module.css` and `*-page.js`.

---

## Release pipeline

Releases are driven by [release-please](https://github.com/googleapis/release-please). Commits to `main` must follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.). On merge of the release PR, GitHub Actions builds and uploads `.zip` files for Chrome, Firefox, and Safari to the GitHub Release.

---

## License

MIT — see [LICENSE](LICENSE).
