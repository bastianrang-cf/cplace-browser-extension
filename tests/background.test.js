import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

async function loadBackground() {
  const mod = await import('../entrypoints/background.js');
  mod.default.main();
  return mod;
}

beforeEach(async () => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.action, 'enable').mockResolvedValue(undefined);
  vi.spyOn(fakeBrowser.action, 'disable').mockResolvedValue(undefined);
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
      enabledModules: { 'admin-access-highlight': true, 'batch-jobs': false, 'language-switcher': false, 'system-info': false, 'version-badge': true },
    });
    const setSpy = vi.spyOn(fakeBrowser.storage.local, 'set');
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update' });

    expect(setSpy).not.toHaveBeenCalled();
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
    expect(fakeBrowser.action.setPopup).toHaveBeenCalledWith({ tabId: 42, popup: 'popup.html' });
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
