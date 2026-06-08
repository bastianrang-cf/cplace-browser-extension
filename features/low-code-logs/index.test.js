import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  lowCodeLogsCacheItem,
  lowCodeLogsSeenItem,
  lowCodeLogsFiltersItem,
  moduleOptionsItem,
} from '../storage.js';

const BASE_URL = 'https://host/tenant';

beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p) => `chrome-extension://test/${p}`);
  document.documentElement.innerHTML = '<head></head><body></body>';
});

afterEach(() => {
  vi.useRealTimers();
});

async function loadMod() {
  vi.resetModules();
  const { default: mod } = await import('./index.js');
  return mod;
}

function logEntry({
  timestamp = '2026-05-21 12:34:56.789',
  level = 'INFO',
  type = 'info',
  message = 'something happened',
  scriptType,
  scriptId,
  entity,
  spaceId,
  user,
  requestUrl,
  stackTrace,
} = {}) {
  const additionalInfo = {};
  if (scriptType !== undefined) additionalInfo.scriptType = scriptType;
  if (scriptId !== undefined) additionalInfo.scriptId = scriptId;
  if (entity !== undefined) additionalInfo.entity = entity;
  if (spaceId !== undefined) additionalInfo.spaceId = spaceId;
  if (user !== undefined) additionalInfo.user = user;
  if (requestUrl !== undefined) additionalInfo.requestUrl = requestUrl;
  return {
    msg: `${timestamp} ${level} ${message}`,
    type,
    additionalInfo,
    ...(stackTrace ? { stackTrace } : {}),
  };
}

async function flushAsync() {
  for (let i = 0; i < 80; i++) await Promise.resolve();
}

async function dispatchResult(detail) {
  document.dispatchEvent(new CustomEvent('cplace:lowCodeLogsResult', { detail }));
  await flushAsync();
}

// page.js announces readiness via this event; firing it lets the gated
// maybeStartPolling() proceed (page-world fetch listener is "live").
function dispatchReady() {
  document.dispatchEvent(new CustomEvent('cplace:lowCodeLogsPageReady'));
}

describe('low-code-logs descriptor', () => {
  it('has correct id', async () => {
    const mod = await loadMod();
    expect(mod.id).toBe('low-code-logs');
  });

  it('is disabled by default', async () => {
    const mod = await loadMod();
    expect(mod.defaultEnabled).toBe(false);
  });

  it('declares css and pageScript', async () => {
    const mod = await loadMod();
    expect(mod.css).toBe(true);
    expect(mod.pageScript).toBe(true);
  });

  it('has reset-filters action', async () => {
    const mod = await loadMod();
    expect(mod.actions?.[0]?.id).toBe('reset-filters');
  });

  it('defaults match the plan', async () => {
    const mod = await loadMod();
    expect(mod.defaultOptions).toEqual({
      pollIntervalSec: 15,
      maxToasts: 3,
      autoDismissMs: 8000,
      minLevel: 'info',
      stickyOnError: true,
    });
  });
});

describe('parseLogEntry', () => {
  it('extracts timestamp, message from msg', async () => {
    const { parseLogEntry } = await import('./index.js');
    const e = parseLogEntry({ msg: '2026-05-21 12:00:00.000 INFO hello world', type: 'info' });
    expect(e.timestamp).toBe('2026-05-21 12:00:00.000');
    expect(e.type).toBe('info');
    expect(e.message).toBe('hello world');
  });

  it('falls back to raw msg when format does not match', async () => {
    const { parseLogEntry } = await import('./index.js');
    const e = parseLogEntry({ msg: 'malformed entry', type: 'warn' });
    expect(e.timestamp).toBe('');
    expect(e.message).toBe('malformed entry');
    expect(e.type).toBe('warn');
  });

  it('does not throw when additionalInfo is absent', async () => {
    const { parseLogEntry } = await import('./index.js');
    expect(() => parseLogEntry({ msg: 'x', type: 'info' })).not.toThrow();
  });
});

describe('fnv1aHex hash stability', () => {
  it('produces the same hash for the same input', async () => {
    const { fnv1aHex, parseLogEntry } = await import('./index.js');
    const a = parseLogEntry(logEntry({ user: 'u1' })).id;
    const b = parseLogEntry(logEntry({ user: 'u1' })).id;
    expect(a).toBe(b);
    expect(fnv1aHex('abc')).toBe(fnv1aHex('abc'));
  });

  it('differs when user differs', async () => {
    const { parseLogEntry } = await import('./index.js');
    const a = parseLogEntry(logEntry({ user: 'u1' })).id;
    const b = parseLogEntry(logEntry({ user: 'u2' })).id;
    expect(a).not.toBe(b);
  });
});

describe('passesFilters', () => {
  it('empty filters = pass-through', async () => {
    const { passesFilters, parseLogEntry } = await import('./index.js');
    const e = parseLogEntry(logEntry({ scriptType: 'cf.X' }));
    expect(passesFilters(e, {})).toBe(true);
    expect(passesFilters(e, null)).toBe(true);
  });

  it('exclude wins over include', async () => {
    const { passesFilters, parseLogEntry } = await import('./index.js');
    const e = parseLogEntry(logEntry({ scriptType: 'cf.X' }));
    const filters = { scriptType: { include: ['cf.X'], exclude: ['cf.X'] } };
    expect(passesFilters(e, filters)).toBe(false);
  });

  it('include-only passes through entries missing the field', async () => {
    const { passesFilters, parseLogEntry } = await import('./index.js');
    const e = parseLogEntry(logEntry({}));
    const filters = { scriptType: { include: ['cf.X'] } };
    // value is undefined → include length > 0 → undefined not in include → fail
    expect(passesFilters(e, filters)).toBe(false);
  });

  it('exclude matches a present field', async () => {
    const { passesFilters, parseLogEntry } = await import('./index.js');
    const e = parseLogEntry(logEntry({ scriptType: 'cf.X' }));
    expect(passesFilters(e, { scriptType: { exclude: ['cf.X'] } })).toBe(false);
    expect(passesFilters(e, { scriptType: { exclude: ['cf.Y'] } })).toBe(true);
  });
});

describe('apply()', () => {
  it('is idempotent', async () => {
    vi.useFakeTimers();
    const mod = await loadMod();
    mod.apply({}, { baseUrl: BASE_URL });
    dispatchReady();
    mod.apply({}, { baseUrl: BASE_URL });
    dispatchReady();
    expect(vi.getTimerCount()).toBe(1);
    mod.revert();
  });

  it('does not start polling when tab is hidden', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    const mod = await loadMod();
    mod.apply({}, { baseUrl: BASE_URL });
    dispatchReady();
    expect(vi.getTimerCount()).toBe(0); // gated by hidden tab
    mod.revert();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('starts polling when tab becomes visible', async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    const mod = await loadMod();
    mod.apply({}, { baseUrl: BASE_URL });
    dispatchReady();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(1);
    mod.revert();
  });
});

// Issue #109: on load the initial fetch must fire as soon as the page script is
// ready AND a context with baseUrl is known; the interval is anchored to it.
describe('eager initial fetch (issue #109)', () => {
  it('does not poll or fetch before the page script is ready', async () => {
    vi.useFakeTimers();
    let dispatched = false;
    document.addEventListener('cplace:fetchLowCodeLogs', () => { dispatched = true; });
    const mod = await loadMod();
    mod.apply({}, { baseUrl: BASE_URL }); // context present, no ready yet
    expect(vi.getTimerCount()).toBe(0);   // polling gated by !pageReady
    expect(dispatched).toBe(false);
    mod.revert();
  });

  it('does not poll or fetch before a context with baseUrl is known', async () => {
    vi.useFakeTimers();
    let dispatched = false;
    document.addEventListener('cplace:fetchLowCodeLogs', () => { dispatched = true; });
    const mod = await loadMod();
    mod.apply({}, null); // no context
    dispatchReady();
    expect(vi.getTimerCount()).toBe(0); // gated by missing baseUrl
    expect(dispatched).toBe(false);
    mod.revert();
  });

  it('starts the polling interval once page-ready and context are present', async () => {
    vi.useFakeTimers();
    const mod = await loadMod();
    mod.apply({}, { baseUrl: BASE_URL });
    expect(vi.getTimerCount()).toBe(0); // nothing before ready
    dispatchReady();
    expect(vi.getTimerCount()).toBe(1); // polling interval started after ready
    mod.revert();
  });

  it('issues the initial fetch when context arrives after apply (onVersionDetected)', async () => {
    let dispatched = 0;
    let lastBaseUrl = null;
    document.addEventListener('cplace:fetchLowCodeLogs', (e) => {
      dispatched++;
      lastBaseUrl = e.detail.baseUrl;
    });
    const mod = await loadMod();
    mod.apply({}, null); // applied before version detected → no context
    dispatchReady();     // page ready, but still no context → no fetch
    await flushAsync();
    expect(dispatched).toBe(0);
    mod.onVersionDetected({ baseUrl: BASE_URL }); // context now known → eager fetch
    await flushAsync();
    expect(dispatched).toBe(1);
    expect(lastBaseUrl).toBe(BASE_URL);
    mod.revert();
  });

  it('issues only one initial fetch when ready and onVersionDetected both fire', async () => {
    let dispatched = 0;
    document.addEventListener('cplace:fetchLowCodeLogs', () => { dispatched++; });
    const mod = await loadMod();
    mod.apply({}, { baseUrl: BASE_URL });
    dispatchReady();                              // starts interval + first fetch
    mod.onVersionDetected({ baseUrl: BASE_URL }); // no-op: interval already running
    await flushAsync();
    expect(dispatched).toBe(1);
    mod.revert();
  });
});

describe('cache behaviour', () => {
  it('skips the fetch event when a fresh cache entry exists', async () => {
    await lowCodeLogsSeenItem.setValue({ [BASE_URL]: { ids: ['existing'], updatedAt: Date.now() } });
    await lowCodeLogsCacheItem.setValue({
      [BASE_URL]: { logs: [], total: 0, error: null, timestamp: Date.now() },
    });
    const mod = await loadMod();
    let dispatched = false;
    document.addEventListener('cplace:fetchLowCodeLogs', () => { dispatched = true; });
    mod.apply({ pollIntervalSec: 60 }, { baseUrl: BASE_URL });
    dispatchReady();
    await flushAsync();
    expect(dispatched).toBe(false);
    mod.revert();
  });

  it('dispatches fetch when cache entry is stale', async () => {
    await lowCodeLogsSeenItem.setValue({ [BASE_URL]: { ids: ['existing'], updatedAt: Date.now() } });
    await lowCodeLogsCacheItem.setValue({
      [BASE_URL]: { logs: [], total: 0, error: null, timestamp: Date.now() - 60 * 60 * 1000 },
    });
    const mod = await loadMod();
    let dispatched = false;
    document.addEventListener('cplace:fetchLowCodeLogs', () => { dispatched = true; });
    mod.apply({ pollIntervalSec: 15 }, { baseUrl: BASE_URL });
    dispatchReady();
    await flushAsync();
    expect(dispatched).toBe(true);
    mod.revert();
  });
});

describe('silent init and dedup', () => {
  it('first apply with no seen record renders no toasts and seeds seen IDs', async () => {
    const mod = await loadMod();
    mod.apply({}, { baseUrl: BASE_URL });
    await dispatchResult({ logs: [logEntry({ user: 'u1' })], total: 1 });
    expect(document.querySelectorAll('.cplace-lcl-toast').length).toBe(0);
    const seen = await lowCodeLogsSeenItem.getValue();
    expect(seen[BASE_URL].ids.length).toBe(1);
    mod.revert();
  });

  it('same entry across two polls produces exactly one toast', async () => {
    await lowCodeLogsSeenItem.setValue({ [BASE_URL]: { ids: ['seed'], updatedAt: Date.now() } });
    const mod = await loadMod();
    mod.apply({}, { baseUrl: BASE_URL });
    const entry = logEntry({ user: 'u1' });
    await dispatchResult({ logs: [entry], total: 1 });
    await dispatchResult({ logs: [entry], total: 1 });
    expect(document.querySelectorAll('.cplace-lcl-toast').length).toBe(1);
    mod.revert();
  });
});

describe('reload safety', () => {
  it('entries present in cache but absent from seen toast on first post-reload poll', async () => {
    // Pre-reload state: seen has an old entry; cache has the latest including a brand-new entry.
    await lowCodeLogsSeenItem.setValue({ [BASE_URL]: { ids: ['oldhash'], updatedAt: Date.now() } });
    const newEntry = logEntry({ user: 'u-new', message: 'fresh' });
    await lowCodeLogsCacheItem.setValue({
      [BASE_URL]: { logs: [newEntry], total: 1, error: null, timestamp: Date.now() },
    });

    const mod = await loadMod();
    mod.apply({ pollIntervalSec: 60 }, { baseUrl: BASE_URL });
    dispatchReady();
    // The cache-fresh path renders without dispatching fetch.
    await flushAsync();
    expect(document.querySelectorAll('.cplace-lcl-toast').length).toBe(1);
    mod.revert();
  });
});

describe('toast rendering', () => {
  beforeEach(async () => {
    await lowCodeLogsSeenItem.setValue({ [BASE_URL]: { ids: ['seed'], updatedAt: Date.now() } });
  });

  it('error toast is sticky when stickyOnError is true', async () => {
    vi.useFakeTimers();
    const mod = await loadMod();
    mod.apply({ autoDismissMs: 1000, stickyOnError: true }, { baseUrl: BASE_URL });
    await dispatchResult({ logs: [logEntry({ type: 'error', user: 'u1' })], total: 1 });
    expect(document.querySelectorAll('.cplace-lcl-toast').length).toBe(1);
    vi.advanceTimersByTime(5000);
    expect(document.querySelectorAll('.cplace-lcl-toast').length).toBe(1);
    mod.revert();
  });

  it('non-error toast is dismissed after autoDismissMs', async () => {
    vi.useFakeTimers();
    const mod = await loadMod();
    mod.apply({ autoDismissMs: 500, stickyOnError: true }, { baseUrl: BASE_URL });
    await dispatchResult({ logs: [logEntry({ type: 'info', user: 'u1' })], total: 1 });
    expect(document.querySelectorAll('.cplace-lcl-toast').length).toBe(1);
    vi.advanceTimersByTime(600);
    expect(document.querySelectorAll('.cplace-lcl-toast').length).toBe(0);
    mod.revert();
  });

  it('overflow collapses into a +N pill above maxToasts', async () => {
    const mod = await loadMod();
    mod.apply({ maxToasts: 2 }, { baseUrl: BASE_URL });
    await dispatchResult({
      logs: [
        logEntry({ user: 'u1', message: 'a' }),
        logEntry({ user: 'u2', message: 'b' }),
        logEntry({ user: 'u3', message: 'c' }),
        logEntry({ user: 'u4', message: 'd' }),
      ],
      total: 4,
    });
    expect(document.querySelectorAll('.cplace-lcl-toast').length).toBe(2);
    const pill = document.querySelector('.cplace-lcl-overflow');
    expect(pill?.textContent).toBe('+2 more');
    mod.revert();
  });

  it('renders an inline stack trace for errors that include one', async () => {
    const mod = await loadMod();
    mod.apply({}, { baseUrl: BASE_URL });
    await dispatchResult({
      logs: [logEntry({ type: 'error', user: 'u1', stackTrace: 'java.lang.RuntimeException\n  at ...' })],
      total: 1,
    });
    expect(document.querySelector('.cplace-lcl-stack pre')?.textContent).toContain('RuntimeException');
    mod.revert();
  });
});

describe('minLevel filter', () => {
  it('suppresses entries below the configured minimum level', async () => {
    await lowCodeLogsSeenItem.setValue({ [BASE_URL]: { ids: ['seed'], updatedAt: Date.now() } });
    const mod = await loadMod();
    mod.apply({ minLevel: 'warn' }, { baseUrl: BASE_URL });
    await dispatchResult({
      logs: [
        logEntry({ type: 'info', user: 'u1', message: 'an info' }),
        logEntry({ type: 'warn', user: 'u2', message: 'a warn' }),
      ],
      total: 2,
    });
    expect(document.querySelectorAll('.cplace-lcl-toast').length).toBe(1);
    mod.revert();
  });
});

describe('filters from storage', () => {
  beforeEach(async () => {
    await lowCodeLogsSeenItem.setValue({ [BASE_URL]: { ids: ['seed'], updatedAt: Date.now() } });
  });

  it('skips entries excluded by the persisted filter', async () => {
    await lowCodeLogsFiltersItem.setValue({
      [BASE_URL]: { scriptType: { include: [], exclude: ['cf.cplace.platform.Job'] } },
    });
    const mod = await loadMod();
    mod.apply({}, { baseUrl: BASE_URL });
    await dispatchResult({
      logs: [
        logEntry({ user: 'u1', scriptType: 'cf.cplace.platform.Job' }),
        logEntry({ user: 'u2', scriptType: 'cf.other' }),
      ],
      total: 2,
    });
    expect(document.querySelectorAll('.cplace-lcl-toast').length).toBe(1);
    mod.revert();
  });

  it('reset-filters action clears only the current baseUrl', async () => {
    await lowCodeLogsFiltersItem.setValue({
      [BASE_URL]: { scriptType: { exclude: ['cf.X'] } },
      'https://other/t2': { scriptType: { exclude: ['cf.Y'] } },
    });
    const mod = await loadMod();
    mod.apply({}, { baseUrl: BASE_URL });
    await mod.onAction('reset-filters', { baseUrl: BASE_URL });
    const after = await lowCodeLogsFiltersItem.getValue();
    expect(after[BASE_URL]).toBeUndefined();
    expect(after['https://other/t2']).toBeDefined();
    mod.revert();
  });
});

describe('popup action visibility', () => {
  it('isVisible returns false when no filters', async () => {
    const mod = await loadMod();
    const action = mod.actions[0];
    expect(await action.isVisible({ baseUrl: BASE_URL })).toBe(false);
  });

  it('isVisible returns true when filters exist for baseUrl', async () => {
    await lowCodeLogsFiltersItem.setValue({
      [BASE_URL]: { scriptType: { exclude: ['cf.X'] } },
    });
    const mod = await loadMod();
    const action = mod.actions[0];
    expect(await action.isVisible({ baseUrl: BASE_URL })).toBe(true);
  });

  it('getLabel reports the active count', async () => {
    await lowCodeLogsFiltersItem.setValue({
      [BASE_URL]: { scriptType: { include: ['a'], exclude: ['b', 'c'] } },
    });
    const mod = await loadMod();
    const label = await mod.actions[0].getLabel({ baseUrl: BASE_URL });
    expect(label).toBe('Reset Low-Code Logs filters (3 active)');
  });
});

describe('revert()', () => {
  it('is safe to call when not applied', async () => {
    const mod = await loadMod();
    expect(() => mod.revert()).not.toThrow();
  });

  it('removes the stack DOM and clears intervals', async () => {
    vi.useFakeTimers();
    await lowCodeLogsSeenItem.setValue({ [BASE_URL]: { ids: ['seed'], updatedAt: Date.now() } });
    const mod = await loadMod();
    mod.apply({}, { baseUrl: BASE_URL });
    await dispatchResult({ logs: [logEntry({ user: 'u1' })], total: 1 });
    expect(document.getElementById('cplace-low-code-logs-stack')).not.toBeNull();
    mod.revert();
    expect(document.getElementById('cplace-low-code-logs-stack')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('position persistence', () => {
  it('restores saved panel position from options', async () => {
    const mod = await loadMod();
    mod.apply({ panelPosition: { top: 100, right: 50 } }, { baseUrl: BASE_URL });
    await lowCodeLogsSeenItem.setValue({ [BASE_URL]: { ids: ['seed'], updatedAt: Date.now() } });
    await dispatchResult({ logs: [logEntry({ user: 'u1' })], total: 1 });
    const stack = document.getElementById('cplace-low-code-logs-stack');
    expect(stack?.style.getPropertyValue('--cplace-lcl-top')).toBe('100px');
    expect(stack?.style.getPropertyValue('--cplace-lcl-right')).toBe('50px');
    mod.revert();
  });
});

describe('buildValueElement', () => {
  it('spaceId becomes a link to /space/details?id=<value>', async () => {
    const { buildValueElement } = await import('./index.js');
    const el = buildValueElement('spaceId', 'cstqpqun6j', BASE_URL);
    expect(el.tagName).toBe('A');
    expect(el.getAttribute('href')).toBe(`${BASE_URL}/space/details?id=cstqpqun6j`);
    expect(el.getAttribute('target')).toBe('_blank');
    expect(el.getAttribute('rel')).toBe('noopener noreferrer');
    expect(el.textContent).toBe('cstqpqun6j');
  });

  it('user becomes a link to /persons/<value>', async () => {
    const { buildValueElement } = await import('./index.js');
    const el = buildValueElement('user', 'wdu0pgexdz', BASE_URL);
    expect(el.tagName).toBe('A');
    expect(el.getAttribute('href')).toBe(`${BASE_URL}/persons/wdu0pgexdz`);
  });

  it('absolute requestUrl becomes a direct link', async () => {
    const { buildValueElement } = await import('./index.js');
    const el = buildValueElement('requestUrl', 'https://example.com/test', BASE_URL);
    expect(el.tagName).toBe('A');
    expect(el.getAttribute('href')).toBe('https://example.com/test');
  });

  it('internal requestUrl sentinel stays as a span', async () => {
    const { buildValueElement } = await import('./index.js');
    const el = buildValueElement('requestUrl', '<internal>', BASE_URL);
    expect(el.tagName).toBe('SPAN');
    expect(el.textContent).toBe('<internal>');
  });

  it('non-linkable fields render full value in a span', async () => {
    const { buildValueElement } = await import('./index.js');
    const longValue = 'cf.cplace.platform.SomeReallyLongJobClassName';
    const el = buildValueElement('scriptType', longValue, BASE_URL);
    expect(el.tagName).toBe('SPAN');
    expect(el.textContent).toBe(longValue);
  });

  it('does not link spaceId / user when baseUrl is missing', async () => {
    const { buildValueElement } = await import('./index.js');
    const el = buildValueElement('spaceId', 'cstqpqun6j', null);
    expect(el.tagName).toBe('SPAN');
  });
});

describe('clampPosition', () => {
  it('keeps top within the viewport', async () => {
    const { clampPosition } = await import('./index.js');
    const fake = { getBoundingClientRect: () => ({ width: 360, height: 200 }) };
    const orig = { iw: window.innerWidth, ih: window.innerHeight };
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    const result = clampPosition({ top: 5000, right: 16 }, fake);
    expect(result.top).toBeLessThanOrEqual(800);
    expect(result.top).toBeGreaterThanOrEqual(0);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: orig.iw });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: orig.ih });
  });
});
