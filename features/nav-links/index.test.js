import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import mod, { navLinks, isValidNavPath, sanitizeCustomLinks, resolveLinks } from './index.js';

describe('nav-links module', () => {
  it('has correct id', () => {
    expect(mod.id).toBe('nav-links');
  });

  it('is enabled by default', () => {
    expect(mod.defaultEnabled).toBe(true);
  });

  it('has no actions array', () => {
    expect(mod.actions).toBeUndefined();
  });

  it('has no pageScript flag', () => {
    expect(mod.pageScript).toBeFalsy();
  });

  it('has no css flag', () => {
    expect(mod.css).toBeFalsy();
  });

  it('exposes a navLinks array', () => {
    expect(Array.isArray(mod.navLinks)).toBe(true);
  });

  it('has exactly 10 links', () => {
    expect(mod.navLinks).toHaveLength(10);
  });

  it('every entry has a non-empty string label', () => {
    for (const { label } of mod.navLinks) {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("every entry has a path starting with '/'", () => {
    for (const { path } of mod.navLinks) {
      expect(path).toMatch(/^\//);
    }
  });

  it('all paths are unique', () => {
    const paths = mod.navLinks.map((l) => l.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('all labels are unique', () => {
    const labels = mod.navLinks.map((l) => l.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('includes All Workspaces → /space/allSpaces', () => {
    expect(mod.navLinks.find((l) => l.path === '/space/allSpaces')?.label).toBe('All Workspaces');
  });

  it('includes All Packages → /solutionmanagement/viewAll', () => {
    expect(mod.navLinks.find((l) => l.path === '/solutionmanagement/viewAll')?.label).toBe('All Packages');
  });

  it('includes Batch Jobs → /batchJob/jobs', () => {
    expect(mod.navLinks.find((l) => l.path === '/batchJob/jobs')?.label).toBe('Batch Jobs');
  });

  it('includes Low-Code Dashboard → /cplacejsAdmin/cplaceJSDashboard', () => {
    expect(mod.navLinks.find((l) => l.path === '/cplacejsAdmin/cplaceJSDashboard')?.label).toBe('Low-Code Dashboard');
  });

  it('includes Low-Code Logs → /cplacejsAdmin/cplaceJSLogs', () => {
    expect(mod.navLinks.find((l) => l.path === '/cplacejsAdmin/cplaceJSLogs')?.label).toBe('Low-Code Logs');
  });

  it('includes API Tokens → /cf/cplace/apiToken/handler/viewAll', () => {
    expect(mod.navLinks.find((l) => l.path === '/cf/cplace/apiToken/handler/viewAll')?.label).toBe('API Tokens');
  });

  it('includes AI Settings → /application/viewAiSettings', () => {
    expect(mod.navLinks.find((l) => l.path === '/application/viewAiSettings')?.label).toBe('AI Settings');
  });

  it('includes Deleted Items → /restorable/trashCanPages', () => {
    expect(mod.navLinks.find((l) => l.path === '/restorable/trashCanPages')?.label).toBe('Deleted Items');
  });

  it('includes Activity Stream → /awareness/recentChanges', () => {
    expect(mod.navLinks.find((l) => l.path === '/awareness/recentChanges')?.label).toBe('Activity Stream');
  });

  it('includes My Drafts → /draft/myDrafts', () => {
    expect(mod.navLinks.find((l) => l.path === '/draft/myDrafts')?.label).toBe('My Drafts');
  });
});

describe('nav-links isValidNavPath', () => {
  it('accepts a relative path beginning with a single /', () => {
    expect(isValidNavPath('/batchJob/jobs')).toBe(true);
    expect(isValidNavPath('  /space/allSpaces  ')).toBe(true);
  });

  it('rejects non-relative, protocol-relative and absolute URLs', () => {
    expect(isValidNavPath('batchJob/jobs')).toBe(false);
    expect(isValidNavPath('//evil.com/x')).toBe(false);
    expect(isValidNavPath('https://evil.com')).toBe(false);
    expect(isValidNavPath('/path/with/\\backslash')).toBe(false);
    expect(isValidNavPath('')).toBe(false);
    expect(isValidNavPath(null)).toBe(false);
    expect(isValidNavPath(42)).toBe(false);
  });
});

describe('nav-links sanitizeCustomLinks', () => {
  it('trims, validates, and falls back label to path', () => {
    const out = sanitizeCustomLinks([
      { label: '  My Page  ', path: '  /my/page  ' },
      { label: '', path: '/no/label' },
    ]);
    expect(out).toEqual([
      { label: 'My Page', path: '/my/page' },
      { label: '/no/label', path: '/no/label' },
    ]);
  });

  it('drops invalid paths and dedupes against built-ins and itself', () => {
    const out = sanitizeCustomLinks([
      { label: 'Bad', path: 'no-slash' },
      { label: 'Dup of builtin', path: '/batchJob/jobs' },
      { label: 'Custom', path: '/custom' },
      { label: 'Custom again', path: '/custom' },
    ]);
    expect(out).toEqual([{ label: 'Custom', path: '/custom' }]);
  });

  it('returns an empty array for non-array input', () => {
    expect(sanitizeCustomLinks(undefined)).toEqual([]);
    expect(sanitizeCustomLinks(null)).toEqual([]);
  });
});

describe('nav-links resolveLinks', () => {
  it('returns all built-ins when nothing is disabled or customized', () => {
    expect(resolveLinks({})).toHaveLength(navLinks.length);
  });

  it('filters out disabled paths and appends custom links', () => {
    const links = resolveLinks({
      disabledPaths: ['/space/allSpaces'],
      customLinks: [{ label: 'Custom', path: '/custom' }],
    });
    const paths = links.map((l) => l.path);
    expect(paths).not.toContain('/space/allSpaces');
    expect(paths).toContain('/custom');
    expect(links).toHaveLength(navLinks.length); // -1 disabled +1 custom
  });

  it('ignores invalid custom links', () => {
    const links = resolveLinks({ customLinks: [{ label: 'Evil', path: '//evil.com' }] });
    expect(links).toHaveLength(navLinks.length);
  });
});

describe('nav-links onAction', () => {
  let openSpy;
  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => {
    openSpy.mockRestore();
  });

  it('opens baseUrl + path in a new tab for a valid path', () => {
    mod.onAction('/batchJob/jobs', { baseUrl: 'https://demo.cplace.cloud/tenant' });
    expect(openSpy).toHaveBeenCalledWith(
      'https://demo.cplace.cloud/tenant/batchJob/jobs',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('does nothing without a baseUrl', () => {
    mod.onAction('/batchJob/jobs', {});
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('does nothing for an invalid (off-origin) path', () => {
    mod.onAction('//evil.com', { baseUrl: 'https://demo.cplace.cloud' });
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe('nav-links options editor', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('defaults disabledPaths and customLinks to empty arrays', () => {
    expect(mod.defaultOptions).toEqual({ disabledPaths: [], customLinks: [] });
  });

  it('exposes a renderOptions function', () => {
    expect(typeof mod.renderOptions).toBe('function');
  });

  function makeCtx(options) {
    let current = options;
    const setOptions = vi.fn((next) => { current = next; });
    return { ctx: { getOptions: () => current, setOptions, getDefaults: () => mod.defaultOptions }, setOptions };
  }

  it('renders one toggle checkbox per built-in link, all checked when nothing is disabled', () => {
    const container = document.createElement('div');
    const { ctx } = makeCtx({ disabledPaths: [], customLinks: [] });
    mod.renderOptions(container, ctx);
    const rows = container.querySelectorAll('.nav-links-row:not(.nav-links-row--custom)');
    expect(rows).toHaveLength(navLinks.length);
    const boxes = container.querySelectorAll('.nav-links-toggle');
    expect(boxes).toHaveLength(navLinks.length);
    for (const cb of boxes) expect(cb.checked).toBe(true);
  });

  it('renders the toggle unchecked for a disabled path', () => {
    const container = document.createElement('div');
    const { ctx } = makeCtx({ disabledPaths: ['/space/allSpaces'], customLinks: [] });
    mod.renderOptions(container, ctx);
    const firstToggle = container.querySelector('.nav-links-row .nav-links-toggle');
    expect(firstToggle.checked).toBe(false); // /space/allSpaces is the first built-in
  });

  it('persists disabledPaths (preserving customLinks) when a toggle is unchecked', () => {
    const container = document.createElement('div');
    const { ctx, setOptions } = makeCtx({ disabledPaths: [], customLinks: [] });
    mod.renderOptions(container, ctx);
    const firstToggle = container.querySelector('.nav-links-toggle');
    firstToggle.checked = false;
    firstToggle.dispatchEvent(new Event('change'));
    expect(setOptions).toHaveBeenCalledWith({
      disabledPaths: [navLinks[0].path],
      customLinks: [],
    });
  });

  it('adds a valid custom link via the add form', () => {
    const container = document.createElement('div');
    const { ctx, setOptions } = makeCtx({ disabledPaths: [], customLinks: [] });
    mod.renderOptions(container, ctx);
    container.querySelector('.nav-links-add-label').value = 'My Page';
    container.querySelector('.nav-links-add-path').value = '/my/page';
    container.querySelector('.nav-links-add-btn').dispatchEvent(new Event('click'));
    expect(setOptions).toHaveBeenCalledWith({
      disabledPaths: [],
      customLinks: [{ label: 'My Page', path: '/my/page' }],
    });
    // The new custom row is rendered.
    expect(container.querySelectorAll('.nav-links-row--custom')).toHaveLength(1);
  });

  it('rejects an invalid custom path with feedback and does not persist', () => {
    const container = document.createElement('div');
    const { ctx, setOptions } = makeCtx({ disabledPaths: [], customLinks: [] });
    mod.renderOptions(container, ctx);
    container.querySelector('.nav-links-add-path').value = 'not-a-path';
    container.querySelector('.nav-links-add-btn').dispatchEvent(new Event('click'));
    expect(setOptions).not.toHaveBeenCalled();
    const error = container.querySelector('.nav-links-add .nav-links-error');
    expect(error.hidden).toBe(false);
  });

  it('rejects a duplicate custom path', () => {
    const container = document.createElement('div');
    const { ctx, setOptions } = makeCtx({ disabledPaths: [], customLinks: [] });
    mod.renderOptions(container, ctx);
    container.querySelector('.nav-links-add-path').value = '/batchJob/jobs'; // dup of built-in
    container.querySelector('.nav-links-add-btn').dispatchEvent(new Event('click'));
    expect(setOptions).not.toHaveBeenCalled();
  });

  it('removes a custom link', () => {
    const container = document.createElement('div');
    const { ctx, setOptions } = makeCtx({
      disabledPaths: [],
      customLinks: [{ label: 'Custom', path: '/custom' }],
    });
    mod.renderOptions(container, ctx);
    expect(container.querySelectorAll('.nav-links-row--custom')).toHaveLength(1);
    container.querySelector('.nav-links-remove').dispatchEvent(new Event('click'));
    expect(setOptions).toHaveBeenCalledWith({ disabledPaths: [], customLinks: [] });
  });

  it('clears the stored shortcut when a custom link is removed', async () => {
    await fakeBrowser.storage.local.set({
      moduleShortcuts: { 'nav-links': { '/custom': { mod: true, code: 'KeyK' } } },
    });
    const container = document.createElement('div');
    const { ctx } = makeCtx({
      disabledPaths: [],
      customLinks: [{ label: 'Custom', path: '/custom' }],
    });
    mod.renderOptions(container, ctx);
    for (let i = 0; i < 8; i++) await Promise.resolve();

    container.querySelector('.nav-links-remove').dispatchEvent(new Event('click'));
    for (let i = 0; i < 8; i++) await Promise.resolve();

    const stored = await fakeBrowser.storage.local.get('moduleShortcuts');
    expect(stored.moduleShortcuts?.['nav-links']?.['/custom']).toBeUndefined();
  });

  it('re-keys the stored shortcut when a custom link path is edited', async () => {
    await fakeBrowser.storage.local.set({
      moduleShortcuts: { 'nav-links': { '/custom': { mod: true, code: 'KeyK' } } },
    });
    const container = document.createElement('div');
    const { ctx } = makeCtx({
      disabledPaths: [],
      customLinks: [{ label: 'Custom', path: '/custom' }],
    });
    mod.renderOptions(container, ctx);
    for (let i = 0; i < 8; i++) await Promise.resolve();

    const pathInput = container.querySelector('.nav-links-path-input');
    pathInput.value = '/renamed';
    pathInput.dispatchEvent(new Event('change'));
    for (let i = 0; i < 8; i++) await Promise.resolve();

    const stored = await fakeBrowser.storage.local.get('moduleShortcuts');
    expect(stored.moduleShortcuts?.['nav-links']?.['/custom']).toBeUndefined();
    expect(stored.moduleShortcuts?.['nav-links']?.['/renamed']).toEqual({ mod: true, code: 'KeyK' });
  });

  it('reflects a stored shortcut on the matching link recorder once loaded', async () => {
    await fakeBrowser.storage.local.set({
      moduleShortcuts: { 'nav-links': { '/batchJob/jobs': { mod: true, code: 'KeyB' } } },
    });
    const container = document.createElement('div');
    const { ctx } = makeCtx({ disabledPaths: [], customLinks: [] });
    mod.renderOptions(container, ctx);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const setRecorders = [...container.querySelectorAll('.module-shortcut__recorder.is-set')];
    expect(setRecorders).toHaveLength(1);
  });
});
