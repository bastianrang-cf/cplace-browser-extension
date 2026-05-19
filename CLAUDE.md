# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome/Edge Manifest V3 browser extension for cplace solutions. Core behavior: detects whether the current page contains an element with `id="cplace"` and swaps the toolbar icon between a colored "c" (detected) and greyscale (not detected). Optional behaviors are implemented as **feature modules** (under `features/`) that the user can toggle on the Options page.

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

### Host access is opt-in (no static `<all_urls>`)

The manifest deliberately does **not** declare static `host_permissions` or `content_scripts` matches. Instead:

- `wxt.config.js` declares `optional_host_permissions: ['<all_urls>']` and adds `'scripting'` to `permissions`.
- `entrypoints/content.js` uses `defineContentScript({ registration: 'runtime', ... })` — WXT builds the script to `content-scripts/content.js` but does **not** add it to the manifest or to `host_permissions`.
- `entrypoints/background.js` calls `ensureContentScriptRegistration()` on startup and on every `browser.permissions.onAdded` / `onRemoved` event. It uses `browser.scripting.registerContentScripts` (id `cplace-content`) when the user has granted `<all_urls>` and `unregisterContentScripts` when they revoke.
- `entrypoints/popup/popup.js` and `entrypoints/options/options.js` show an **Enable on all pages** button that calls `browser.permissions.request({ origins: ['<all_urls>'] })` directly from a user-gesture click handler (Chrome rejects the request otherwise). The shared wrappers live in `features/permissions.js`.
- On fresh install, `background.js` opens the options page if the permission has not been granted yet.

The motivation is Chrome Web Store review time: static `<all_urls>` triggers a heavyweight review, while `optional_host_permissions` does not. After the user grants, the UX is identical to the previous static-permission build.

### Core vs feature modules

- **Core** (always on, once host access is granted): `entrypoints/content.js` detects `#cplace` (initial + debounced `MutationObserver`), messages the background. `entrypoints/background.js` calls `browser.action.setIcon({ tabId, path })` with per-tab color or grey icon set.
- **Feature modules** (opt-in, in `features/`): each lives in `features/<id>/index.js` and exports a default descriptor `{ id, name, description, defaultEnabled, ...flags }`. `features/registry.js` auto-discovers all features and exposes `{ all(), byId(id), defaultEnabledMap() }`.

> Naming: the root `modules/` directory is reserved by WXT for **build modules** (project-local Vite/WXT extensions). Domain feature toggles therefore live in `features/`. A WXT build module at `modules/cplace-features.js` is what wires per-feature assets into the build output.

### Module lifecycle

1. On install, `background.js` seeds the typed storage items in `features/storage.js` (`enabledModulesItem`, `moduleOptionsItem`) from `registry.defaultEnabledMap()` / `registry.defaultOptionsMap()` (only fills gaps; existing keys are preserved).
2. Content script reads those items on load and applies each enabled module — injecting declared assets (CSS, page scripts) then calling `apply()`. State is tracked in a per-tab `Set` so toggles are idempotent.
3. Options page writes to the same storage items and sends `{ type: 'cplace:moduleToggle', id, enabled }` to the background, which fans out via `browser.tabs.sendMessage` to every tab. Content scripts also call `enabledModulesItem.watch(...)` as a backstop.

### Adding a new feature module

1. Create a `features/<id>/` directory containing:
   - `index.js` — default export with `id`, `name`, `description`, `defaultEnabled`, and optional asset flags (see below). Add `apply()` / `revert()` only for business logic beyond asset injection; both are optional.
   - `index.test.js` — Vitest tests for the feature (picked up automatically).
   - `module.css` *(optional)* — styles; declare `css: true` in the descriptor to have the framework auto-inject/remove them.
   - `page.js` *(optional)* — page-world IIFE; declare `pageScript: true` in the descriptor to have the framework auto-inject/remove it.

That's it — the registry auto-discovers all `features/*/index.js` files via `import.meta.glob`. No other files need to change.

**README:** Whenever you add a new feature module or change an existing one's name, description, or default, update the **Modules** table in `README.md` to match.

### Feature asset injection (CSP-safe pattern)

**Never use `style.textContent` or `script.textContent`** — inline styles/scripts are blocked by pages with a strict CSP and mix presentation/page-world concerns into JS.

The framework in `content.js` automatically handles asset injection via flags on the descriptor. Helpers live in `features/utils.js` (used internally by the framework — features do not import utils directly).

**CSS styles** (`features/<id>/module.css`):
- Place styles in `features/<id>/module.css`.
- Declare `css: true` in the descriptor.
- The framework injects `<link id="cplace-<id>-link" rel="stylesheet" href="<id>-module.css">` on apply and removes it on revert.

**Page-world scripts** (`features/<id>/page.js`):
- Place page-world logic in `features/<id>/page.js` (plain IIFE, no ES module exports). Use this when a feature needs access to page-level globals (e.g. `_cplace_languages_`, `jQuery`).
- Declare `pageScript: true` in the descriptor.
- The framework calls WXT's `injectScript('/<id>-page.js', { keepInDom: true, modifyScript })` on apply (setting `id="cplace-<id>-script"`) and removes the element on revert.

The WXT build module at `modules/cplace-features.js` stages each `features/<id>/module.css` → `<id>-module.css` and `features/<id>/page.js` → `<id>-page.js` (plus any per-feature `*.svg`/`*.png` icons) into a staging directory that is registered via `addPublicAssets`, so they appear at the extension root in the final build. `web_accessible_resources` already covers `*-module.css` and `*-page.js` — no `wxt.config.js` changes needed.

Extension-origin resources loaded via `href`/`src` are always CSP-safe — no `unsafe-inline` required.

### Caching repeated same-instance requests

Users typically open many tabs of the same cplace instance/tenant. If a feature issues a network request whose response is identical across those tabs, **cache the response** so sibling tabs reuse it instead of refetching.

- Define a dedicated storage item in `features/storage.js`: `storage.defineItem('local:<feature>Cache', { fallback: {} })`. Use `local:` — `chrome.storage.session` requires a background-side `setAccessLevel` to be reachable from content scripts.
- Key the cache by `context.baseUrl` (origin + tenant) when the endpoint is tenant-scoped (e.g. `/flexigrid/customTableData`), or by `context.origin` when the endpoint is tenant-agnostic (e.g. version detection). Both come from `deriveBaseUrl()` in `features/base-url.js` and are already passed into `apply()` / `onVersionDetected()`.
- Cache shape: `{ rows/data, error: null, timestamp: Date.now() }`. TTL should be slightly shorter than the natural refresh interval (e.g. `Math.max(pollMs - 5_000, Math.floor(pollMs * 0.9))`) so sibling tabs reliably hit the shared entry without ever serving data older than the user-configured interval.
- On cache hit, render directly from the cached value — do **not** re-dispatch the result event, since that would re-write the cache and indefinitely extend the TTL.
- Only write the cache on real network results, never on errors (otherwise a transient failure poisons every sibling tab).
- Prune entries older than ~1h on each write to keep the map small.

Reference implementation: the `batch-jobs` feature (`features/batch-jobs/index.js`, `batchJobsCacheItem` in `features/storage.js`).

### WXT idioms used by this project

- Entrypoints use `defineBackground`, `defineContentScript`, `defineUnlistedScript` from the `#imports` auto-import alias.
- Page-world scripts are injected with `injectScript()` (from `#imports`); `public/detect-version-page.js` is itself an unlisted entrypoint at `entrypoints/detect-version-page.js`.
- Storage is accessed only through `wxt/utils/storage`'s `storage.defineItem('local:...', { fallback: {} })` — `enabledModulesItem` and `moduleOptionsItem` live in `features/storage.js` and replace direct `browser.storage.local.get/set` and `browser.storage.onChanged` usage.

## Testing

Run with `npm test` (uses Vitest + `@webext-core/fake-browser` via the `WxtVitest` plugin).

Feature tests live alongside the feature: `features/<id>/index.test.js`. Core tests live in `tests/`:

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
