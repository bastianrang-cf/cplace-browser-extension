# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome/Edge Manifest V3 browser extension for cplace solutions. Core behavior: detects whether the current page contains an element with `id="cplace"` and swaps the toolbar icon between a colored "c" (detected) and greyscale (not detected). Optional behaviors are implemented as **modules** that the user can toggle on the Options page.

Built with **WXT** (Vite-based extension framework). Plain JS, no TypeScript.

## Build / Dev / Test

```bash
npm install            # devDeps: wxt, vitest, sharp, etc.
npm run build:icons    # regenerate public/icons/ PNGs from icons/source.svg
npm run dev            # dev build with HMR — load .output/chrome-mv3/ as unpacked extension
npm run build          # production build to .output/chrome-mv3/
npm run package        # build icons + wxt zip → .output/*.zip (used by release CI)
npm test               # run vitest test suite
npm run test:watch     # run vitest in watch mode
```

Load unpacked at `chrome://extensions` (Developer mode), pointing to `.output/chrome-mv3/`.

WXT generates `manifest.json` from `wxt.config.js` — do not create a manual `manifest.json`.

## Architecture

### Core vs modules

- **Core** (always on): `entrypoints/content.js` detects `#cplace` (initial + debounced `MutationObserver`), messages the background. `entrypoints/background.js` calls `browser.action.setIcon({ tabId, path })` with per-tab color or grey icon set.
- **Modules** (opt-in, in `modules/`): each module lives in its own subdirectory (`modules/<id>/index.js`) and exports a default descriptor `{ id, name, description, defaultEnabled, apply(), revert() }`. `modules/registry.js` auto-discovers all modules and exposes `{ all(), byId(id), defaultEnabledMap() }`.

### Module lifecycle

1. On install, `background.js` seeds `browser.storage.local.enabledModules` from `registry.defaultEnabledMap()` (only fills gaps; existing keys are preserved).
2. Content script reads `enabledModules` on load and calls `apply()` for each enabled module. State (which modules are currently applied) is tracked in a per-tab `Set` so toggles are idempotent.
3. Options page writes to `browser.storage.local` and sends `{ type: 'cplace:moduleToggle', id, enabled }` to the background, which fans out via `browser.tabs.sendMessage` to every tab. Content scripts also listen on `browser.storage.onChanged` as a backstop.

### Adding a new module

1. Create a `modules/<id>/` directory containing:
   - `index.js` — default export `{ id, name, description, defaultEnabled, apply, revert }`. Keep `apply` idempotent and `revert` exact (so live toggles are clean).
   - `index.test.js` — Vitest tests for the module (picked up automatically).

That's it — the registry auto-discovers all `modules/*/index.js` files via `import.meta.glob`. No other files need to change.

**README:** Whenever you add a new module or change an existing module's name, description, or default, update the **Modules** table in `README.md` to match.

### Page-world script injection (CSP-safe pattern)

Content scripts run in an isolated world. If a module needs to access page-level globals (e.g. `_cplace_languages_`, `jQuery`), it must inject a script into the page's MAIN world. **Never use `script.textContent`** — that counts as inline script execution and is blocked by pages with a strict CSP.

Instead:
1. Place the page-world logic in `modules/<id>/page.js` (plain IIFE, no ES module exports).
2. In `apply()`, inject via `script.src = browser.runtime.getURL('<id>-page.js')`.

The build automatically copies each `modules/<id>/page.js` to `<id>-page.js` in the extension root and `web_accessible_resources` uses a `*-page.js` glob — no `wxt.config.js` changes needed.

Extension-origin scripts loaded via `src` are always CSP-safe — no `unsafe-inline` required.

## Testing

Run with `npm test` (uses Vitest + `@webext-core/fake-browser` via the `WxtVitest` plugin).

Module tests live alongside the module: `modules/<id>/index.test.js`. Core tests live in `tests/`:

- `tests/registry.test.js` — pure registry logic
- `tests/background.test.js` — onInstalled seeding, onMessage routing
- `tests/content.test.js` — detection, module lifecycle, toggle handling

CI runs `npm test` on every PR to `main` (`.github/workflows/ci.yml`).

## Release pipeline (release-please)

- `release-please-config.json` + `.release-please-manifest.json` drive `release-type: simple`. The `extra-files` config bumps `package.json` `$.version`; WXT reads the version from `package.json` automatically when generating the manifest.
- `.github/workflows/release-please.yml`:
  - Job 1 (`release-please`) runs on pushes to `main`, opens/maintains the release PR; on merge it tags + creates a GitHub Release.
  - Job 2 (`package`) runs when `release_created == 'true'`: `npm ci`, `npm run package`, then `gh release upload <tag> .output/*.zip`.
- Commits must follow Conventional Commits for release-please to pick them up (`feat:`, `fix:`, `chore:`, etc.).
