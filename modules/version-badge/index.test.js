import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import mod from './index.js';

beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.runtime, 'sendMessage').mockResolvedValue(undefined);
});

describe('version-badge — onVersionDetected', () => {
  it('sends cplace:setBadge with version, color, and title', () => {
    mod.onVersionDetected({ version: '25.4', hostname: 'example.com', tenant: 'mytenant' });

    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'cplace:setBadge',
      text: '25.4',
      color: '#2563eb',
      title: 'cplace 25.4 on example.com/mytenant',
    });
  });

  it('omits tenant from title when tenant is null', () => {
    mod.onVersionDetected({ version: '25.4', hostname: 'example.com', tenant: null });

    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'cplace 25.4 on example.com' }),
    );
  });

  it('sends empty text and null color when version is null', () => {
    mod.onVersionDetected({ version: null, hostname: 'example.com', tenant: null });

    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'cplace:setBadge',
      text: '',
      color: null,
      title: 'cplace on example.com',
    });
  });

  it('omits hostname segment when hostname is empty', () => {
    mod.onVersionDetected({ version: '25.4', hostname: '', tenant: null });

    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'cplace 25.4' }),
    );
  });
});

describe('version-badge — revert', () => {
  it('sends cplace:clearBadge', () => {
    mod.revert();

    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'cplace:clearBadge' });
  });
});

describe('version-badge — apply', () => {
  it('apply does not throw', () => {
    expect(() => mod.apply()).not.toThrow();
  });
});
