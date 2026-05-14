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
- **Modules** (opt-in, in `modules/`): each module file exports a default descriptor `{ id, name, description, defaultEnabled, apply(), revert() }`. `modules/registry.js` imports all modules and exposes `{ all(), byId(id), defaultEnabledMap() }`.

### Module lifecycle

1. On install, `background.js` seeds `browser.storage.local.enabledModules` from `registry.defaultEnabledMap()` (only fills gaps; existing keys are preserved).
2. Content script reads `enabledModules` on load and calls `apply()` for each enabled module. State (which modules are currently applied) is tracked in a per-tab `Set` so toggles are idempotent.
3. Options page writes to `browser.storage.local` and sends `{ type: 'cplace:moduleToggle', id, enabled }` to the background, which fans out via `browser.tabs.sendMessage` to every tab. Content scripts also listen on `browser.storage.onChanged` as a backstop.

### Adding a new module

1. Create `modules/<id>.js` with a default export `{ id, name, description, defaultEnabled, apply, revert }`. Keep `apply` idempotent and `revert` exact (so live toggles are clean).
2. Import it in `modules/registry.js` and add it to the `modules` array.

That's it — WXT handles loading it in all contexts automatically.

## Testing

Tests live in `tests/`. Run with `npm test` (uses Vitest + `@webext-core/fake-browser` via the `WxtVitest` plugin).

- `tests/registry.test.js` — pure registry logic
- `tests/admin-access-highlight.test.js` — module apply/revert DOM behavior
- `tests/background.test.js` — onInstalled seeding, onMessage routing
- `tests/content.test.js` — detection, module lifecycle, toggle handling

CI runs `npm test` on every PR to `main` (`.github/workflows/ci.yml`).

## Release pipeline (release-please)

- `release-please-config.json` + `.release-please-manifest.json` drive `release-type: simple`. The `extra-files` config bumps `package.json` `$.version`; WXT reads the version from `package.json` automatically when generating the manifest.
- `.github/workflows/release-please.yml`:
  - Job 1 (`release-please`) runs on pushes to `main`, opens/maintains the release PR; on merge it tags + creates a GitHub Release.
  - Job 2 (`package`) runs when `release_created == 'true'`: `npm ci`, `npm run package`, then `gh release upload <tag> .output/*.zip`.
- Commits must follow Conventional Commits for release-please to pick them up (`feat:`, `fix:`, `chore:`, etc.).
