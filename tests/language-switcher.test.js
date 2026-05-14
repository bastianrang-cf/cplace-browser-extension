import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import mod from '../modules/language-switcher.js';

beforeEach(() => {
  fakeBrowser.reset();
  document.documentElement.innerHTML = '<head></head><body></body>';
});

describe('language-switcher module', () => {
  it('has correct id', () => {
    expect(mod.id).toBe('language-switcher');
  });

  it('is disabled by default', () => {
    expect(mod.defaultEnabled).toBe(false);
  });

  it('has a switch-language action', () => {
    expect(mod.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'switch-language' })]),
    );
  });

  describe('apply()', () => {
    it('creates a script element with the correct id', () => {
      mod.apply();
      expect(document.getElementById('cplace-language-switcher-script')).not.toBeNull();
    });

    it('injects the script into the document head', () => {
      mod.apply();
      const script = document.getElementById('cplace-language-switcher-script');
      expect(document.head.contains(script)).toBe(true);
    });

    it('script content contains the trigger event name', () => {
      mod.apply();
      const script = document.getElementById('cplace-language-switcher-script');
      expect(script.textContent).toContain('cplace:doSwitchLanguage');
    });

    it('is idempotent — calling twice creates only one script element', () => {
      mod.apply();
      mod.apply();
      const scripts = document.querySelectorAll('#cplace-language-switcher-script');
      expect(scripts.length).toBe(1);
    });

    it('falls back to documentElement when head is absent', () => {
      document.head.remove();
      mod.apply();
      const script = document.getElementById('cplace-language-switcher-script');
      expect(script).not.toBeNull();
      expect(document.documentElement.contains(script)).toBe(true);
    });
  });

  describe('revert()', () => {
    it('removes the script element after apply', () => {
      mod.apply();
      mod.revert();
      expect(document.getElementById('cplace-language-switcher-script')).toBeNull();
    });

    it('is idempotent — safe to call when not applied', () => {
      expect(() => mod.revert()).not.toThrow();
    });
  });

  describe('onAction()', () => {
    it('dispatches the trigger event on document for switch-language', () => {
      const spy = vi.spyOn(document, 'dispatchEvent');
      mod.onAction('switch-language');
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'cplace:doSwitchLanguage' }),
      );
    });

    it('does not dispatch an event for an unknown action id', () => {
      const spy = vi.spyOn(document, 'dispatchEvent');
      mod.onAction('unknown-action');
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
