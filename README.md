# cplace browser extension

[![Version](https://img.shields.io/badge/version-0.4.0-blue)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![CI](https://github.com/bastianrang-cf/cplace-browser-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/bastianrang-cf/cplace-browser-extension/actions/workflows/ci.yml)

A Chrome / Edge / Firefox extension for [cplace](https://cplace.com) solutions.

**Core behavior:** detects whether the current page is a cplace application (by the presence of `id="cplace"` in the DOM) and switches the toolbar icon between a colored **c** (detected) and a greyscale icon (not detected). Optional behaviors are implemented as toggleable **modules**.

---

## Modules

| Module | Default | Description |
|---|---|---|
| Admin access highlight | off | Shows a red page border when the logged-in user has cplace admin access |
| Batch Jobs overlay | off | Shows a live overlay of running batch jobs on every cplace page, polling every 15 s while the tab is visible |
| Language Switcher | off | Switch the cplace display language from the extension popup |

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
npm run build:icons    # regenerate public/icons/ PNGs from icons/source.svg
npm run dev            # dev build with HMR — load .output/chrome-mv3/ as unpacked
npm run build          # production build
npm run package        # build icons + zip for all targets (Chrome, Firefox, Safari)
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

Each module is a file in `modules/` that exports a descriptor:

```js
export default {
  id: 'my-module',
  name: 'My Module',
  description: 'What it does.',
  defaultEnabled: false,
  apply()  { /* activate — must be idempotent */ },
  revert() { /* undo apply exactly */ },
};
```

`modules/registry.js` imports all modules. The background seeds `browser.storage.local` on first install. The content script reads storage, calls `apply()` / `revert()` on toggles, and listens for live `cplace:moduleToggle` messages broadcast by the background when settings change.

### Adding a new module

1. Create `modules/<id>.js` with the descriptor shape above.
2. Import it in `modules/registry.js` and add it to the `modules` array.
3. **Update the Modules table in this README** to reflect the new module's name, default, and description.

WXT handles loading it in all contexts automatically.

### CSP-safe page-world injection

Content scripts run in an isolated world. If a module needs page-level globals (e.g. `jQuery`, `_cplace_languages_`), place the logic in `public/<id>-page.js` and inject via:

```js
script.src = browser.runtime.getURL('<id>-page.js');
```

Declare the file under `manifest.web_accessible_resources` in `wxt.config.js`. Scripts loaded this way are always CSP-safe — no `unsafe-inline` needed.

---

## Release pipeline

Releases are driven by [release-please](https://github.com/googleapis/release-please). Commits to `main` must follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.). On merge of the release PR, GitHub Actions builds and uploads `.zip` files for Chrome, Firefox, and Safari to the GitHub Release.

---

## License

MIT — see [LICENSE](LICENSE).
