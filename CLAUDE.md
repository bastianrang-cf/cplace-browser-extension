# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome/Edge Manifest V3 browser extension for cplace solutions. Core behavior: detects whether the current page contains an element with `id="cplace"` and swaps the toolbar icon between a colored "c" (detected) and greyscale (not detected). Optional behaviors are implemented as **modules** that the user can toggle on the Options page.

Plain JS, no bundler, no framework. The only build step is rendering icon PNGs from `icons/source.svg` (and zipping the extension for release).

## Build / Package

```bash
npm install            # devDeps: sharp (icon rasterization), adm-zip (release bundle)
npm run build:icons    # regenerate icons/color-*.png and icons/gray-*.png from source.svg
npm run package        # build icons + emit dist/cplace-browser-extension-<version>.zip
```

Load unpacked at `chrome://extensions` (Developer mode), pointing to the repo root. PNG icons are committed so the extension is loadable without running `npm install` first.

## Architecture

### Core vs modules

- **Core** (always on, in `src/content.js` + `src/background.js`): detects `#cplace` (initial + debounced `MutationObserver`), messages the background, background calls `chrome.action.setIcon({ tabId, path })` with the per-tab color or grey icon set.
- **Modules** (opt-in, in `src/modules/`): each module file pushes a descriptor onto `globalThis.__cplaceModules` with `{ id, name, description, defaultEnabled, apply(), revert() }`. The same file is loaded in three contexts via plain `<script>` / `importScripts` / manifest `content_scripts`:
  - content script — `apply`/`revert` mutate the page DOM
  - service worker — only `defaultEnabled` is read (registry seeds storage on install)
  - options page — only `id`/`name`/`description`/`defaultEnabled` are read (rendering checkboxes)
- `src/modules/registry.js` exposes `globalThis.__cplaceRegistry` with `all()`, `byId(id)`, `defaultEnabledMap()`. Registry must not touch `document` (it runs in the service worker too).

### Module lifecycle

1. On install, `background.js` seeds `chrome.storage.local.enabledModules` from `defaultEnabledMap()` (only fills gaps; existing keys are preserved).
2. Content script reads `enabledModules` on load and calls `apply()` for each enabled module. State (which modules are currently applied) is tracked in a per-tab `Set` so toggles are idempotent.
3. Options page writes to `chrome.storage.local` and sends `{ type: 'cplace:moduleToggle', id, enabled }` to the background, which fans out via `chrome.tabs.sendMessage` to every tab. Content scripts also listen on `chrome.storage.onChanged` as a backstop.

### Adding a new module

1. Create `src/modules/<id>.js` that pushes `{ id, name, description, defaultEnabled, apply, revert }` onto `globalThis.__cplaceModules`. Keep `apply` idempotent and `revert` exact (so live toggles are clean).
2. Register the file in **three places** so it loads in every context:
   - `manifest.json` → `content_scripts[0].js` (before `src/content.js`)
   - `src/background.js` → `importScripts(...)`
   - `src/options/options.html` → `<script src="...">` (before `options.js`)

## Release pipeline (release-please)

- `release-please-config.json` + `.release-please-manifest.json` drive `release-type: simple`. The `extra-files` config bumps `manifest.json` `$.version` and `package.json` `$.version` so the published zip's manifest version matches the release tag.
- `.github/workflows/release-please.yml`:
  - Job 1 (`release-please`) runs on pushes to `main`, opens/maintains the release PR; on merge it tags + creates a GitHub Release.
  - Job 2 (`package`) runs when `release_created == 'true'`: `npm ci`, `npm run package`, then `gh release upload <tag> dist/*.zip`.
- Commits must follow Conventional Commits for release-please to pick them up (`feat:`, `fix:`, `chore:`, etc.).
