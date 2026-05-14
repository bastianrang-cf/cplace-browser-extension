import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

async function loadContent() {
  const mod = await import('../entrypoints/content.js');
  mod.default.main();
  // Drain the storage.get microtask chain without using timers
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  return mod;
}

beforeEach(async () => {
  vi.useRealTimers();
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(undefined);
  vi.resetModules();
  document.documentElement.innerHTML = '<head></head><body></body>';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('content — #cplace detection', () => {
  it('sends found:true when #cplace is present at load', async () => {
    document.body.innerHTML = '<div id="cplace"></div>';
    await loadContent();

    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'cplace:status',
      found: true,
    });
  });

  it('sends found:false when #cplace is absent at load', async () => {
    await loadContent();

    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'cplace:status',
      found: false,
    });
  });

  it('deduplicates — does not send a second message when state is unchanged', async () => {
    await loadContent();
    vi.clearAllMocks();

    // Trigger a DOM mutation that doesn't change #cplace presence
    document.body.appendChild(document.createElement('span'));
    vi.useFakeTimers();
    vi.advanceTimersByTime(250);

    expect(fakeBrowser.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

describe('content — MutationObserver debounce', () => {
  it('sends updated status after 250ms when DOM changes', async () => {
    await loadContent(); // load with real timers first
    vi.clearAllMocks();
    vi.useFakeTimers(); // switch to fake timers AFTER loading

    document.body.innerHTML = '<div id="cplace"></div>';
    // Drain the microtask that queues the MutationObserver callback
    await Promise.resolve();
    await Promise.resolve();
    // Observer fires but debounce hasn't elapsed yet
    expect(fakeBrowser.runtime.sendMessage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);

    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'cplace:status',
      found: true,
    });
  });
});

describe('content — module initialization', () => {
  it('applies enabled modules after storage resolves', async () => {
    await fakeBrowser.storage.local.set({ enabledModules: { 'admin-access-highlight': true } });
    await loadContent();

    expect(document.getElementById('cplace-admin-access-highlight-style')).not.toBeNull();
  });

  it('does not apply disabled modules', async () => {
    await fakeBrowser.storage.local.set({ enabledModules: { 'admin-access-highlight': false } });
    await loadContent();

    expect(document.getElementById('cplace-admin-access-highlight-style')).toBeNull();
  });
});

describe('content — cplace:moduleToggle listener', () => {
  it('applies a module when enabled:true message is received', async () => {
    await fakeBrowser.storage.local.set({ enabledModules: { 'admin-access-highlight': false } });
    await loadContent();

    await fakeBrowser.runtime.onMessage.trigger({
      type: 'cplace:moduleToggle',
      id: 'admin-access-highlight',
      enabled: true,
    });

    expect(document.getElementById('cplace-admin-access-highlight-style')).not.toBeNull();
  });

  it('reverts a module when enabled:false message is received', async () => {
    await fakeBrowser.storage.local.set({ enabledModules: { 'admin-access-highlight': true } });
    await loadContent();

    await fakeBrowser.runtime.onMessage.trigger({
      type: 'cplace:moduleToggle',
      id: 'admin-access-highlight',
      enabled: false,
    });

    expect(document.getElementById('cplace-admin-access-highlight-style')).toBeNull();
  });

  it('ignores messages with unknown module ids', async () => {
    await loadContent();
    await expect(
      fakeBrowser.runtime.onMessage.trigger({
        type: 'cplace:moduleToggle',
        id: 'unknown-module',
        enabled: true,
      }),
    ).resolves.not.toThrow();
  });

  it('ignores messages with a different type', async () => {
    await fakeBrowser.storage.local.set({ enabledModules: { 'admin-access-highlight': false } });
    await loadContent();
    await fakeBrowser.runtime.onMessage.trigger({ type: 'other:message' });

    expect(document.getElementById('cplace-admin-access-highlight-style')).toBeNull();
  });
});

describe('content — storage.onChanged backstop', () => {
  it('applies modules when enabledModules changes in local storage', async () => {
    await loadContent();

    // Writing to storage fires onChanged automatically in fakeBrowser
    await fakeBrowser.storage.local.set({ enabledModules: { 'admin-access-highlight': true } });

    expect(document.getElementById('cplace-admin-access-highlight-style')).not.toBeNull();
  });

  it('ignores changes to areas other than local', async () => {
    await fakeBrowser.storage.local.set({ enabledModules: { 'admin-access-highlight': false } });
    await loadContent();

    await fakeBrowser.storage.sync.set({ enabledModules: { 'admin-access-highlight': true } });

    expect(document.getElementById('cplace-admin-access-highlight-style')).toBeNull();
  });
});
