import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

async function loadBackground() {
  const mod = await import('../entrypoints/background.js');
  mod.default.main();
  return mod;
}

let permissionsListeners;
let permissionsContainsMock;
let scriptingMocks;

beforeEach(async () => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.action, 'enable').mockResolvedValue(undefined);
  vi.spyOn(fakeBrowser.action, 'disable').mockResolvedValue(undefined);
  vi.spyOn(fakeBrowser.action, 'setPopup').mockResolvedValue(undefined);
  vi.spyOn(fakeBrowser.action, 'setTitle').mockResolvedValue(undefined);
  vi.spyOn(fakeBrowser.action, 'setBadgeText').mockResolvedValue(undefined);
  vi.spyOn(fakeBrowser.action, 'setBadgeBackgroundColor').mockResolvedValue(undefined);
  vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockResolvedValue(undefined);

  permissionsListeners = { added: [], removed: [] };
  permissionsContainsMock = vi.fn().mockResolvedValue(false);
  fakeBrowser.permissions = {
    contains: permissionsContainsMock,
    request: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(true),
    onAdded: { addListener: (fn) => permissionsListeners.added.push(fn) },
    onRemoved: { addListener: (fn) => permissionsListeners.removed.push(fn) },
  };
  scriptingMocks = {
    getRegisteredContentScripts: vi.fn().mockResolvedValue([]),
    registerContentScripts: vi.fn().mockResolvedValue(undefined),
    unregisterContentScripts: vi.fn().mockResolvedValue(undefined),
  };
  fakeBrowser.scripting = scriptingMocks;

  fakeBrowser.runtime.openOptionsPage = vi.fn().mockResolvedValue(undefined);

  vi.resetModules();
});

describe('background — onInstalled', () => {
  it('seeds storage with module defaults on fresh install', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' });

    const stored = await fakeBrowser.storage.local.get('enabledModules');
    expect(stored.enabledModules).toMatchObject({
      'domain-css': false,
      'batch-jobs': false,
      'language-switcher': false,
      'version-badge': true,
    });
  });

  it('does not overwrite keys that already exist in storage', async () => {
    await fakeBrowser.storage.local.set({ enabledModules: { 'version-badge': false } });
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update' });

    const stored = await fakeBrowser.storage.local.get('enabledModules');
    expect(stored.enabledModules['version-badge']).toBe(false);
  });

  it('does not call storage.set when all keys already exist', async () => {
    const enabledKeys = {
      'domain-css': false, 'batch-jobs': false, 'language-switcher': false,
      'low-code-logs': false,
      'nav-links': true, 'system-info': false, 'version-badge': true,
    };
    await fakeBrowser.storage.local.set({
      enabledModules: enabledKeys,
      moduleOptions: {
        'batch-jobs': { limitJobs: 10, pollInterval: 60 },
        'domain-css': { rules: [{ pattern: '*', css: 'body {}' }] },
        'low-code-logs': {
          pollIntervalSec: 15, maxToasts: 3, autoDismissMs: 8000,
          minLevel: 'info', stickyOnError: true,
        },
        'nav-links': { disabledPaths: [] },
      },
    });
    const setSpy = vi.spyOn(fakeBrowser.storage.local, 'set');
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update' });

    expect(setSpy).not.toHaveBeenCalled();
  });

  it('seeds moduleOptions with defaults on fresh install', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' });

    const stored = await fakeBrowser.storage.local.get('moduleOptions');
    expect(stored.moduleOptions).toMatchObject({ 'batch-jobs': { limitJobs: 10 } });
  });

  it('fills in missing option keys without overwriting existing ones', async () => {
    await fakeBrowser.storage.local.set({ moduleOptions: { 'batch-jobs': { limitJobs: 5 } } });
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update' });

    const stored = await fakeBrowser.storage.local.get('moduleOptions');
    expect(stored.moduleOptions['batch-jobs'].limitJobs).toBe(5);
  });
});

describe('background — onMessage: cplace:status', () => {
  it('enables action and sets popup when found is true', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:status', found: true },
      { tab: { id: 42 } },
    );

    expect(fakeBrowser.action.enable).toHaveBeenCalledWith(42);
    expect(fakeBrowser.action.setPopup).toHaveBeenCalledWith({ tabId: 42, popup: 'popup.html?tabId=42' });
  });

  it('disables action when found is false', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:status', found: false },
      { tab: { id: 7 } },
    );

    expect(fakeBrowser.action.disable).toHaveBeenCalledWith(7);
    expect(fakeBrowser.action.setPopup).not.toHaveBeenCalled();
  });

  it('resets title and badge when found is false', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:status', found: false },
      { tab: { id: 7 } },
    );

    expect(fakeBrowser.action.setTitle).toHaveBeenCalledWith({ tabId: 7, title: 'cplace' });
    expect(fakeBrowser.action.setBadgeText).toHaveBeenCalledWith({ tabId: 7, text: '' });
  });

  it('does not set title or badge when found is true', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:status', found: true },
      { tab: { id: 7 } },
    );

    expect(fakeBrowser.action.setTitle).not.toHaveBeenCalled();
    expect(fakeBrowser.action.setBadgeText).not.toHaveBeenCalled();
  });

  it('does not call enable or setPopup when sender has no tab', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:status', found: true },
      {},
    );

    expect(fakeBrowser.action.enable).not.toHaveBeenCalled();
    expect(fakeBrowser.action.setPopup).not.toHaveBeenCalled();
  });

  it('does nothing for a null message', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(null, {});

    expect(fakeBrowser.action.enable).not.toHaveBeenCalled();
    expect(fakeBrowser.action.disable).not.toHaveBeenCalled();
  });
});

describe('background — onMessage: cplace:context', () => {
  it('stores the tab baseUrl in session storage (not the popup URL)', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:context', baseUrl: 'https://demo.cplace.com/tenant' },
      { tab: { id: 9 } },
    );
    await new Promise((r) => setTimeout(r, 0));

    const stored = await fakeBrowser.storage.session.get('tabBaseUrl');
    expect(stored.tabBaseUrl).toEqual({ 9: 'https://demo.cplace.com/tenant' });
    expect(fakeBrowser.action.setPopup).not.toHaveBeenCalled();
  });

  it('removes the tab entry when baseUrl is missing', async () => {
    await fakeBrowser.storage.session.set({ tabBaseUrl: { 9: 'https://old.example.com' } });
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:context', baseUrl: null },
      { tab: { id: 9 } },
    );
    await new Promise((r) => setTimeout(r, 0));

    const stored = await fakeBrowser.storage.session.get('tabBaseUrl');
    expect(stored.tabBaseUrl).toEqual({});
  });

  it('does nothing when sender has no tab', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:context', baseUrl: 'https://demo.cplace.com/tenant' },
      {},
    );
    await new Promise((r) => setTimeout(r, 0));

    const stored = await fakeBrowser.storage.session.get('tabBaseUrl');
    expect(stored.tabBaseUrl ?? {}).toEqual({});
  });

  it('clears the stored baseUrl when the tab is removed', async () => {
    await fakeBrowser.storage.session.set({ tabBaseUrl: { 9: 'https://demo.cplace.com/tenant' } });
    await loadBackground();

    await fakeBrowser.tabs.onRemoved.trigger(9, { windowId: 1, isWindowClosing: false });
    await new Promise((r) => setTimeout(r, 0));

    const stored = await fakeBrowser.storage.session.get('tabBaseUrl');
    expect(stored.tabBaseUrl).toEqual({});
  });
});

describe('background — onMessage: cplace:setBadge', () => {
  it('sets badge text, color, and title when all are provided', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:setBadge', text: '25.4', color: '#2563eb', title: 'cplace 25.4 on example.com' },
      { tab: { id: 1 } },
    );

    expect(fakeBrowser.action.setBadgeText).toHaveBeenCalledWith({ tabId: 1, text: '25.4' });
    expect(fakeBrowser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 1, color: '#2563eb' });
    expect(fakeBrowser.action.setTitle).toHaveBeenCalledWith({ tabId: 1, title: 'cplace 25.4 on example.com' });
  });

  it('sets empty badge text when text is empty string', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:setBadge', text: '', color: null, title: 'cplace' },
      { tab: { id: 2 } },
    );

    expect(fakeBrowser.action.setBadgeText).toHaveBeenCalledWith({ tabId: 2, text: '' });
    expect(fakeBrowser.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it('does not set color when text is empty', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:setBadge', text: '', color: '#2563eb', title: 'cplace' },
      { tab: { id: 3 } },
    );

    expect(fakeBrowser.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it('does nothing when sender has no tab', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:setBadge', text: '25.4', color: '#2563eb', title: 'cplace 25.4' },
      {},
    );

    expect(fakeBrowser.action.setBadgeText).not.toHaveBeenCalled();
  });
});

describe('background — onMessage: cplace:clearBadge', () => {
  it('clears badge text and resets title', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:clearBadge' },
      { tab: { id: 5 } },
    );

    expect(fakeBrowser.action.setBadgeText).toHaveBeenCalledWith({ tabId: 5, text: '' });
    expect(fakeBrowser.action.setTitle).toHaveBeenCalledWith({ tabId: 5, title: 'cplace' });
  });

  it('does nothing when sender has no tab', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:clearBadge' },
      {},
    );

    expect(fakeBrowser.action.setBadgeText).not.toHaveBeenCalled();
    expect(fakeBrowser.action.setTitle).not.toHaveBeenCalled();
  });
});

describe('background — onMessage: cplace:moduleToggle', () => {
  it('sends the toggle message to all tabs with valid ids', async () => {
    await fakeBrowser.tabs.create({ url: 'https://example.com' });
    await loadBackground();

    const msg = { type: 'cplace:moduleToggle', id: 'domain-css', enabled: true };
    await fakeBrowser.runtime.onMessage.trigger(msg, {});

    // Wait for the async tabs.query().then(...) chain
    await new Promise((r) => setTimeout(r, 0));

    expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledWith(
      expect.any(Number),
      msg,
    );
  });

  it('does not send to tabs where id is null', async () => {
    vi.spyOn(fakeBrowser.tabs, 'query').mockResolvedValue([{ id: null }, { id: 5 }]);
    await loadBackground();

    const msg = { type: 'cplace:moduleToggle', id: 'domain-css', enabled: false };
    await fakeBrowser.runtime.onMessage.trigger(msg, {});
    await new Promise((r) => setTimeout(r, 0));

    expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledWith(5, msg);
  });
});

describe('background — content-script registration', () => {
  it('registers the content script on startup when permission is already granted', async () => {
    permissionsContainsMock.mockResolvedValue(true);
    await loadBackground();
    await new Promise((r) => setTimeout(r, 0));

    expect(scriptingMocks.registerContentScripts).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'cplace-content',
        js: ['content-scripts/content.js'],
        matches: ['<all_urls>'],
        runAt: 'document_idle',
      }),
    ]);
  });

  it('does not register on startup when permission is missing', async () => {
    permissionsContainsMock.mockResolvedValue(false);
    await loadBackground();
    await new Promise((r) => setTimeout(r, 0));

    expect(scriptingMocks.registerContentScripts).not.toHaveBeenCalled();
  });

  it('registers when a permission grant fires onAdded', async () => {
    permissionsContainsMock.mockResolvedValue(false);
    await loadBackground();
    await new Promise((r) => setTimeout(r, 0));
    expect(scriptingMocks.registerContentScripts).not.toHaveBeenCalled();

    permissionsContainsMock.mockResolvedValue(true);
    for (const fn of permissionsListeners.added) fn({ origins: ['<all_urls>'] });
    await new Promise((r) => setTimeout(r, 0));

    expect(scriptingMocks.registerContentScripts).toHaveBeenCalledTimes(1);
  });

  it('unregisters when a permission revoke fires onRemoved', async () => {
    permissionsContainsMock.mockResolvedValue(true);
    scriptingMocks.getRegisteredContentScripts.mockResolvedValue([{ id: 'cplace-content' }]);
    await loadBackground();
    await new Promise((r) => setTimeout(r, 0));

    permissionsContainsMock.mockResolvedValue(false);
    for (const fn of permissionsListeners.removed) fn({ origins: ['<all_urls>'] });
    await new Promise((r) => setTimeout(r, 0));

    expect(scriptingMocks.unregisterContentScripts).toHaveBeenCalledWith({ ids: ['cplace-content'] });
  });

  it('is idempotent: does not re-register when already registered', async () => {
    permissionsContainsMock.mockResolvedValue(true);
    scriptingMocks.getRegisteredContentScripts.mockResolvedValue([{ id: 'cplace-content' }]);
    await loadBackground();
    await new Promise((r) => setTimeout(r, 0));

    expect(scriptingMocks.registerContentScripts).not.toHaveBeenCalled();
  });
});

describe('background — onInstalled onboarding', () => {
  it('opens the options page on fresh install when permission is missing', async () => {
    permissionsContainsMock.mockResolvedValue(false);
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' });

    expect(fakeBrowser.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it('does not open the options page on update', async () => {
    permissionsContainsMock.mockResolvedValue(false);
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update' });

    expect(fakeBrowser.runtime.openOptionsPage).not.toHaveBeenCalled();
  });

  it('does not open the options page when permission is already granted on install', async () => {
    permissionsContainsMock.mockResolvedValue(true);
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' });

    expect(fakeBrowser.runtime.openOptionsPage).not.toHaveBeenCalled();
  });
});

describe('background — onMessage: cplace:moduleOptions', () => {
  it('relays the options message to all tabs', async () => {
    await fakeBrowser.tabs.create({ url: 'https://example.com' });
    await loadBackground();

    const msg = { type: 'cplace:moduleOptions', id: 'batch-jobs', options: { limitJobs: 5 } };
    await fakeBrowser.runtime.onMessage.trigger(msg, {});
    await new Promise((r) => setTimeout(r, 0));

    expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledWith(
      expect.any(Number),
      msg,
    );
  });
});

describe('background — onInstalled migration', () => {
  it('flips admin-access-highlight=true into domain-css=true on update', async () => {
    await fakeBrowser.storage.local.set({
      enabledModules: { 'admin-access-highlight': true },
    });
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update' });

    const stored = await fakeBrowser.storage.local.get('enabledModules');
    expect(stored.enabledModules['domain-css']).toBe(true);
    expect(stored.enabledModules).not.toHaveProperty('admin-access-highlight');
  });

  it('does not flip domain-css when admin-access-highlight was false', async () => {
    await fakeBrowser.storage.local.set({
      enabledModules: { 'admin-access-highlight': false },
    });
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update' });

    const stored = await fakeBrowser.storage.local.get('enabledModules');
    expect(stored.enabledModules['domain-css']).toBe(false);
    expect(stored.enabledModules).not.toHaveProperty('admin-access-highlight');
  });

  it('preserves an explicit domain-css=true when admin-access-highlight was already false', async () => {
    await fakeBrowser.storage.local.set({
      enabledModules: { 'admin-access-highlight': false, 'domain-css': true },
    });
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update' });

    const stored = await fakeBrowser.storage.local.get('enabledModules');
    expect(stored.enabledModules['domain-css']).toBe(true);
  });

  it('removes legacy admin-access-highlight from moduleOptions on update', async () => {
    await fakeBrowser.storage.local.set({
      enabledModules: {},
      moduleOptions: { 'admin-access-highlight': {}, 'batch-jobs': { limitJobs: 5 } },
    });
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update' });

    const stored = await fakeBrowser.storage.local.get('moduleOptions');
    expect(stored.moduleOptions).not.toHaveProperty('admin-access-highlight');
    expect(stored.moduleOptions['batch-jobs'].limitJobs).toBe(5);
  });
});

describe('background — onMessage: domain-css', () => {
  it('calls scripting.insertCSS for apply messages and remembers the css', async () => {
    scriptingMocks.insertCSS = vi.fn().mockResolvedValue(undefined);
    scriptingMocks.removeCSS = vi.fn().mockResolvedValue(undefined);
    await loadBackground();

    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:domainCss:apply', css: 'body { color: red; }' },
      { tab: { id: 11 } },
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(scriptingMocks.insertCSS).toHaveBeenCalledWith({
      target: { tabId: 11 },
      css: 'body { color: red; }',
    });
  });

  it('removes previous CSS before inserting new CSS for the same tab', async () => {
    scriptingMocks.insertCSS = vi.fn().mockResolvedValue(undefined);
    scriptingMocks.removeCSS = vi.fn().mockResolvedValue(undefined);
    await loadBackground();

    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:domainCss:apply', css: 'a {}' },
      { tab: { id: 22 } },
    );
    await new Promise((r) => setTimeout(r, 0));
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:domainCss:apply', css: 'b {}' },
      { tab: { id: 22 } },
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(scriptingMocks.removeCSS).toHaveBeenCalledWith({
      target: { tabId: 22 },
      css: 'a {}',
    });
    expect(scriptingMocks.insertCSS).toHaveBeenLastCalledWith({
      target: { tabId: 22 },
      css: 'b {}',
    });
  });

  it('calls scripting.removeCSS for revert messages', async () => {
    scriptingMocks.insertCSS = vi.fn().mockResolvedValue(undefined);
    scriptingMocks.removeCSS = vi.fn().mockResolvedValue(undefined);
    await loadBackground();

    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:domainCss:apply', css: 'a {}' },
      { tab: { id: 33 } },
    );
    await new Promise((r) => setTimeout(r, 0));
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:domainCss:revert' },
      { tab: { id: 33 } },
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(scriptingMocks.removeCSS).toHaveBeenCalledWith({
      target: { tabId: 33 },
      css: 'a {}',
    });
  });

  it('clears per-tab state when the tab is removed', async () => {
    scriptingMocks.insertCSS = vi.fn().mockResolvedValue(undefined);
    scriptingMocks.removeCSS = vi.fn().mockResolvedValue(undefined);
    await loadBackground();

    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:domainCss:apply', css: 'a {}' },
      { tab: { id: 44 } },
    );
    await new Promise((r) => setTimeout(r, 0));

    await fakeBrowser.tabs.onRemoved.trigger(44, { windowId: 1, isWindowClosing: false });
    await new Promise((r) => setTimeout(r, 0));

    // Apply again — should NOT call removeCSS since the previous entry was cleared.
    scriptingMocks.removeCSS.mockClear();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:domainCss:apply', css: 'b {}' },
      { tab: { id: 44 } },
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(scriptingMocks.removeCSS).not.toHaveBeenCalled();
  });
});
