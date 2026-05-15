import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

async function loadBackground() {
  const mod = await import('../entrypoints/background.js');
  mod.default.main();
  return mod;
}

beforeEach(async () => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.action, 'setIcon').mockResolvedValue(undefined);
  vi.spyOn(fakeBrowser.action, 'setPopup').mockResolvedValue(undefined);
  vi.spyOn(fakeBrowser.action, 'setTitle').mockResolvedValue(undefined);
  vi.spyOn(fakeBrowser.action, 'setBadgeText').mockResolvedValue(undefined);
  vi.spyOn(fakeBrowser.action, 'setBadgeBackgroundColor').mockResolvedValue(undefined);
  vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockResolvedValue(undefined);
  vi.resetModules();
});

describe('background — onInstalled', () => {
  it('seeds storage with module defaults on fresh install', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' });

    const stored = await fakeBrowser.storage.local.get('enabledModules');
    expect(stored.enabledModules).toMatchObject({
      'admin-access-highlight': false,
      'batch-jobs': false,
      'language-switcher': false,
      'version-badge': true,
    });
  });

  it('does not overwrite keys that already exist in storage', async () => {
    await fakeBrowser.storage.local.set({ enabledModules: { 'admin-access-highlight': false } });
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update' });

    const stored = await fakeBrowser.storage.local.get('enabledModules');
    expect(stored.enabledModules['admin-access-highlight']).toBe(false);
  });

  it('does not call storage.set when all keys already exist', async () => {
    await fakeBrowser.storage.local.set({
      enabledModules: { 'admin-access-highlight': true, 'batch-jobs': false, 'language-switcher': false, 'version-badge': true },
    });
    const setSpy = vi.spyOn(fakeBrowser.storage.local, 'set');
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update' });

    expect(setSpy).not.toHaveBeenCalled();
  });
});

describe('background — onMessage: cplace:status', () => {
  it('sets color icon and enables popup when found is true', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:status', found: true },
      { tab: { id: 42 } },
    );

    expect(fakeBrowser.action.setIcon).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 42, path: expect.objectContaining({ 16: 'icons/color-16.png' }) }),
    );
    expect(fakeBrowser.action.setPopup).toHaveBeenCalledWith({ tabId: 42, popup: 'popup.html' });
  });

  it('sets gray icon and disables popup when found is false', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:status', found: false },
      { tab: { id: 7 } },
    );

    expect(fakeBrowser.action.setIcon).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 7, path: expect.objectContaining({ 16: 'icons/gray-16.png' }) }),
    );
    expect(fakeBrowser.action.setPopup).toHaveBeenCalledWith({ tabId: 7, popup: '' });
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

  it('does not call setIcon or setPopup when sender has no tab', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:status', found: true },
      {},
    );

    expect(fakeBrowser.action.setIcon).not.toHaveBeenCalled();
    expect(fakeBrowser.action.setPopup).not.toHaveBeenCalled();
  });

  it('does nothing for a null message', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(null, {});

    expect(fakeBrowser.action.setIcon).not.toHaveBeenCalled();
  });
});

describe('background — onMessage: cplace:version', () => {
  it('sets full title and badge when version and tenant are present', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:version', version: '25.4', hostname: 'example.com', tenant: 'mytenant' },
      { tab: { id: 42 } },
    );

    expect(fakeBrowser.action.setTitle).toHaveBeenCalledWith({
      tabId: 42,
      title: 'cplace 25.4 on example.com/mytenant',
    });
    expect(fakeBrowser.action.setBadgeText).toHaveBeenCalledWith({ tabId: 42, text: '25.4' });
    expect(fakeBrowser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 42, color: '#2563eb' });
  });

  it('omits version segment and clears badge when version is null', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:version', version: null, hostname: 'example.com', tenant: 'mytenant' },
      { tab: { id: 5 } },
    );

    expect(fakeBrowser.action.setTitle).toHaveBeenCalledWith({
      tabId: 5,
      title: 'cplace on example.com/mytenant',
    });
    expect(fakeBrowser.action.setBadgeText).toHaveBeenCalledWith({ tabId: 5, text: '' });
    expect(fakeBrowser.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it('omits tenant segment when tenant is null', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:version', version: '25.4', hostname: 'example.com', tenant: null },
      { tab: { id: 3 } },
    );

    expect(fakeBrowser.action.setTitle).toHaveBeenCalledWith({
      tabId: 3,
      title: 'cplace 25.4 on example.com',
    });
  });

  it('does not call setTitle or setBadgeText when sender has no tab', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:version', version: '25.4', hostname: 'example.com', tenant: null },
      {},
    );

    expect(fakeBrowser.action.setTitle).not.toHaveBeenCalled();
    expect(fakeBrowser.action.setBadgeText).not.toHaveBeenCalled();
  });
});

describe('background — onMessage: cplace:version — version-badge module', () => {
  it('sets badge when version-badge is enabled (default)', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:version', version: '25.4', hostname: 'example.com', tenant: null },
      { tab: { id: 1 } },
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(fakeBrowser.action.setBadgeText).toHaveBeenCalledWith({ tabId: 1, text: '25.4' });
  });

  it('does not set badge when version-badge is disabled', async () => {
    await fakeBrowser.storage.local.set({ enabledModules: { 'version-badge': false } });
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:version', version: '25.4', hostname: 'example.com', tenant: null },
      { tab: { id: 2 } },
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(fakeBrowser.action.setBadgeText).not.toHaveBeenCalled();
  });
});

describe('background — onMessage: cplace:moduleToggle — version-badge', () => {
  it('sets badge on cached tabs when toggled on', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:version', version: '25.4', hostname: 'example.com', tenant: null },
      { tab: { id: 10 } },
    );
    await new Promise((r) => setTimeout(r, 0));
    fakeBrowser.action.setBadgeText.mockClear();

    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:moduleToggle', id: 'version-badge', enabled: true },
      {},
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(fakeBrowser.action.setBadgeText).toHaveBeenCalledWith({ tabId: 10, text: '25.4' });
  });

  it('clears badge on cached tabs when toggled off', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:version', version: '25.4', hostname: 'example.com', tenant: null },
      { tab: { id: 10 } },
    );
    await new Promise((r) => setTimeout(r, 0));
    fakeBrowser.action.setBadgeText.mockClear();

    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:moduleToggle', id: 'version-badge', enabled: false },
      {},
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(fakeBrowser.action.setBadgeText).toHaveBeenCalledWith({ tabId: 10, text: '' });
  });

  it('removes tab from cache when cplace:status not found', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:version', version: '25.4', hostname: 'example.com', tenant: null },
      { tab: { id: 10 } },
    );
    await new Promise((r) => setTimeout(r, 0));
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:status', found: false },
      { tab: { id: 10 } },
    );
    fakeBrowser.action.setBadgeText.mockClear();

    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:moduleToggle', id: 'version-badge', enabled: true },
      {},
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(fakeBrowser.action.setBadgeText).not.toHaveBeenCalled();
  });
});

describe('background — onMessage: cplace:moduleToggle', () => {
  it('sends the toggle message to all tabs with valid ids', async () => {
    await fakeBrowser.tabs.create({ url: 'https://example.com' });
    await loadBackground();

    const msg = { type: 'cplace:moduleToggle', id: 'admin-access-highlight', enabled: true };
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

    const msg = { type: 'cplace:moduleToggle', id: 'admin-access-highlight', enabled: false };
    await fakeBrowser.runtime.onMessage.trigger(msg, {});
    await new Promise((r) => setTimeout(r, 0));

    expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledWith(5, msg);
  });
});
