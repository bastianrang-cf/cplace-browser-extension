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
  vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockResolvedValue(undefined);
  vi.resetModules();
});

describe('background — onInstalled', () => {
  it('seeds storage with module defaults on fresh install', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' });

    const stored = await fakeBrowser.storage.local.get('enabledModules');
    expect(stored.enabledModules).toMatchObject({
      'admin-access-highlight': true,
      'language-switcher': false,
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
      enabledModules: { 'admin-access-highlight': true, 'language-switcher': false },
    });
    const setSpy = vi.spyOn(fakeBrowser.storage.local, 'set');
    await loadBackground();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update' });

    expect(setSpy).not.toHaveBeenCalled();
  });
});

describe('background — onMessage: cplace:status', () => {
  it('sets color icon when found is true', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:status', found: true },
      { tab: { id: 42 } },
    );

    expect(fakeBrowser.action.setIcon).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 42, path: expect.objectContaining({ 16: 'icons/color-16.png' }) }),
    );
  });

  it('sets gray icon when found is false', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:status', found: false },
      { tab: { id: 7 } },
    );

    expect(fakeBrowser.action.setIcon).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 7, path: expect.objectContaining({ 16: 'icons/gray-16.png' }) }),
    );
  });

  it('does not call setIcon when sender has no tab', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'cplace:status', found: true },
      {},
    );

    expect(fakeBrowser.action.setIcon).not.toHaveBeenCalled();
  });

  it('does nothing for a null message', async () => {
    await loadBackground();
    await fakeBrowser.runtime.onMessage.trigger(null, {});

    expect(fakeBrowser.action.setIcon).not.toHaveBeenCalled();
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
