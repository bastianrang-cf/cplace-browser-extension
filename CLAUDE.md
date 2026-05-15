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
- **Modules** (opt-in, in `modules/`): each module lives in its own subdirectory (`modules/<id>/index.js`) and exports a default descriptor `{ id, name, description, defaultEnabled, ...flags }`. `modules/registry.js` auto-discovers all modules and exposes `{ all(), byId(id), defaultEnabledMap() }`.

### Module lifecycle

1. On install, `background.js` seeds `browser.storage.local.enabledModules` from `registry.defaultEnabledMap()` (only fills gaps; existing keys are preserved).
2. Content script reads `enabledModules` on load and applies each enabled module — injecting declared assets (CSS, page scripts) then calling `apply()`. State is tracked in a per-tab `Set` so toggles are idempotent.
3. Options page writes to `browser.storage.local` and sends `{ type: 'cplace:moduleToggle', id, enabled }` to the background, which fans out via `browser.tabs.sendMessage` to every tab. Content scripts also listen on `browser.storage.onChanged` as a backstop.

### Adding a new module

1. Create a `modules/<id>/` directory containing:
   - `index.js` — default export with `id`, `name`, `description`, `defaultEnabled`, and optional asset flags (see below). Add `apply()` / `revert()` only for business logic beyond asset injection; both are optional.
   - `index.test.js` — Vitest tests for the module (picked up automatically).
   - `module.css` *(optional)* — module styles; declare `css: true` in the descriptor to have the framework auto-inject/remove them.
   - `page.js` *(optional)* — page-world IIFE; declare `pageScript: true` in the descriptor to have the framework auto-inject/remove it.

That's it — the registry auto-discovers all `modules/*/index.js` files via `import.meta.glob`. No other files need to change.

**README:** Whenever you add a new module or change an existing module's name, description, or default, update the **Modules** table in `README.md` to match.

### Module asset injection (CSP-safe pattern)

**Never use `style.textContent` or `script.textContent`** — inline styles/scripts are blocked by pages with a strict CSP and mix presentation/page-world concerns into JS.

The framework in `content.js` automatically handles asset injection via flags on the module descriptor. Helpers live in `modules/utils.js` (used internally by the framework — modules do not import utils directly).

**CSS styles** (`modules/<id>/module.css`):
- Place styles in `modules/<id>/module.css`.
- Declare `css: true` in the descriptor.
- The framework injects `<link id="cplace-<id>-link" rel="stylesheet" href="<id>-module.css">` on apply and removes it on revert.

**Page-world scripts** (`modules/<id>/page.js`):
- Place page-world logic in `modules/<id>/page.js` (plain IIFE, no ES module exports). Use this when a module needs access to page-level globals (e.g. `_cplace_languages_`, `jQuery`).
- Declare `pageScript: true` in the descriptor.
- The framework injects `<script id="cplace-<id>-script" src="<id>-page.js">` on apply and removes the element on revert.

The build automatically copies each `modules/<id>/module.css` → `<id>-module.css` and `modules/<id>/page.js` → `<id>-page.js` in the extension root; `web_accessible_resources` covers `*-module.css` and `*-page.js` — no `wxt.config.js` changes needed.

Extension-origin resources loaded via `href`/`src` are always CSP-safe — no `unsafe-inline` required.

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
