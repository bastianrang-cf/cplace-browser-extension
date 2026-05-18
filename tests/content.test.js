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
  vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((p) => `chrome-extension://test/${p.replace(/^\//, '')}`);
  vi.spyOn(fakeBrowser.runtime, 'getManifest').mockReturnValue({ manifest_version: 3 });
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

    expect(document.getElementById('cplace-admin-access-highlight-link')).not.toBeNull();
  });

  it('does not apply disabled modules', async () => {
    await fakeBrowser.storage.local.set({ enabledModules: { 'admin-access-highlight': false } });
    await loadContent();

    expect(document.getElementById('cplace-admin-access-highlight-link')).toBeNull();
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

    expect(document.getElementById('cplace-admin-access-highlight-link')).not.toBeNull();
  });

  it('reverts a module when enabled:false message is received', async () => {
    await fakeBrowser.storage.local.set({ enabledModules: { 'admin-access-highlight': true } });
    await loadContent();

    await fakeBrowser.runtime.onMessage.trigger({
      type: 'cplace:moduleToggle',
      id: 'admin-access-highlight',
      enabled: false,
    });

    expect(document.getElementById('cplace-admin-access-highlight-link')).toBeNull();
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

    expect(document.getElementById('cplace-admin-access-highlight-link')).toBeNull();
  });
});

describe('content — cplace:moduleAction listener', () => {
  it('calls onAction when the module is active and message is received', async () => {
    await fakeBrowser.storage.local.set({
      enabledModules: { 'admin-access-highlight': true, 'language-switcher': true },
    });
    await loadContent();

    const spy = vi.spyOn(document, 'dispatchEvent');
    await fakeBrowser.runtime.onMessage.trigger({
      type: 'cplace:moduleAction',
      moduleId: 'language-switcher',
      actionId: 'switch-language',
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cplace:doSwitchLanguage' }),
    );
  });

  it('does nothing when the module is not active', async () => {
    await fakeBrowser.storage.local.set({
      enabledModules: { 'admin-access-highlight': false, 'language-switcher': false },
    });
    await loadContent();

    const spy = vi.spyOn(document, 'dispatchEvent');
    await fakeBrowser.runtime.onMessage.trigger({
      type: 'cplace:moduleAction',
      moduleId: 'language-switcher',
      actionId: 'switch-language',
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it('does nothing for an unknown moduleId', async () => {
    await loadContent();
    await expect(
      fakeBrowser.runtime.onMessage.trigger({
        type: 'cplace:moduleAction',
        moduleId: 'nonexistent-module',
        actionId: 'do-something',
      }),
    ).resolves.not.toThrow();
  });
});

describe('content — version detection', () => {
  it('injects detect-version-page.js when #cplace is present at load', async () => {
    document.body.innerHTML = '<div id="cplace"></div>';
    await loadContent();

    const script = document.querySelector('script[src="chrome-extension://test/detect-version-page.js"]');
    expect(script).not.toBeNull();
  });

  it('does not inject detect-version-page.js when #cplace is absent', async () => {
    await loadContent();

    const script = document.querySelector('script[src="chrome-extension://test/detect-version-page.js"]');
    expect(script).toBeNull();
  });

  it('calls onVersionDetected on active modules when cplace:versionDetected fires', async () => {
    await fakeBrowser.storage.local.set({ enabledModules: { 'version-badge': true } });
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(undefined);
    await loadContent();
    vi.clearAllMocks();

    document.dispatchEvent(new CustomEvent('cplace:versionDetected', {
      detail: { version: '25.4' },
    }));

    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cplace:setBadge', text: '25.4' }),
    );
  });

  it('calls onVersionDetected on newly applied module when version already known', async () => {
    await fakeBrowser.storage.local.set({ enabledModules: { 'version-badge': false } });
    vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(undefined);
    await loadContent();

    document.dispatchEvent(new CustomEvent('cplace:versionDetected', {
      detail: { version: '25.4' },
    }));
    vi.clearAllMocks();

    await fakeBrowser.runtime.onMessage.trigger({
      type: 'cplace:moduleToggle',
      id: 'version-badge',
      enabled: true,
    });

    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cplace:setBadge', text: '25.4' }),
    );
  });
});

describe('content — cplace:moduleOptions listener', () => {
  it('updates options and re-applies active module with new options', async () => {
    vi.useFakeTimers();
    await fakeBrowser.storage.local.set({
      enabledModules: { 'batch-jobs': true },
      moduleOptions: { 'batch-jobs': { limitJobs: 10 } },
    });
    await loadContent();

    await fakeBrowser.runtime.onMessage.trigger({
      type: 'cplace:moduleOptions',
      id: 'batch-jobs',
      options: { limitJobs: 3 },
    });

    // Panel should be removed (revert called) and re-apply started
    expect(document.getElementById('cplace-batch-jobs-panel')).toBeNull();
    vi.useRealTimers();
  });

  it('does not apply if the module is not active', async () => {
    await fakeBrowser.storage.local.set({
      enabledModules: { 'batch-jobs': false },
      moduleOptions: { 'batch-jobs': { limitJobs: 10 } },
    });
    await loadContent();

    await expect(
      fakeBrowser.runtime.onMessage.trigger({
        type: 'cplace:moduleOptions',
        id: 'batch-jobs',
        options: { limitJobs: 3 },
      }),
    ).resolves.not.toThrow();
  });
});

describe('content — storage.onChanged backstop', () => {
  it('applies modules when enabledModules changes in local storage', async () => {
    await loadContent();

    // Writing to storage fires onChanged automatically in fakeBrowser
    await fakeBrowser.storage.local.set({ enabledModules: { 'admin-access-highlight': true } });

    expect(document.getElementById('cplace-admin-access-highlight-link')).not.toBeNull();
  });

  it('ignores changes to areas other than local', async () => {
    await fakeBrowser.storage.local.set({ enabledModules: { 'admin-access-highlight': false } });
    await loadContent();

    await fakeBrowser.storage.sync.set({ enabledModules: { 'admin-access-highlight': true } });

    expect(document.getElementById('cplace-admin-access-highlight-link')).toBeNull();
  });
});
