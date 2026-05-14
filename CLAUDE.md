# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Chrome/Edge browser extension for cplace solutions. This project is in early initialization — the build system, source structure, and tooling are not yet established.

## Architecture

Browser extensions consist of:
- **Manifest** (`manifest.json`) — declares permissions, entry points, and extension metadata (target: Manifest V3 for Chrome/Edge)
- **Background service worker** — runs in the background, handles events, manages state
- **Content scripts** — injected into web pages, interact with the DOM
- **Popup/options UI** — extension popup or settings pages

When the project is scaffolded, expect a structure like:
```
src/
  background/    # Service worker
  content/       # Content scripts
  popup/         # Extension popup UI
  options/       # Settings page (optional)
manifest.json
```

## Build, Lint, Test Commands

> These will be defined once package.json and tooling are set up. Update this section when scaffolding is complete.

Common patterns for browser extension projects:
```bash
npm install        # Install dependencies
npm run build      # Bundle extension output
npm run dev        # Watch mode for development
npm run lint       # Lint source files
npm run test       # Run test suite
```

## Development Notes

- Target browsers: Chrome and Edge (Chromium-based, so a single build typically covers both)
- Load the unpacked extension during development via `chrome://extensions` with Developer Mode enabled, pointing to the build output directory
- Manifest V3 requires service workers instead of background pages and has stricter CSP rules
