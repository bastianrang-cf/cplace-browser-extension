import { describe, it, expect, beforeEach } from 'vitest';
import mod from '../modules/admin-access-highlight.js';

beforeEach(() => {
  document.documentElement.innerHTML = '<head></head><body></body>';
});

describe('admin-access-highlight module', () => {
  it('has correct id', () => {
    expect(mod.id).toBe('admin-access-highlight');
  });

  it('is disabled by default', () => {
    expect(mod.defaultEnabled).toBe(false);
  });

  describe('apply()', () => {
    it('creates a style element with the correct id', () => {
      mod.apply();
      expect(document.getElementById('cplace-admin-access-highlight-style')).not.toBeNull();
    });

    it('injects the style into the document head', () => {
      mod.apply();
      const style = document.getElementById('cplace-admin-access-highlight-style');
      expect(document.head.contains(style)).toBe(true);
    });

    it('style content targets the correct selector', () => {
      mod.apply();
      const style = document.getElementById('cplace-admin-access-highlight-style');
      expect(style.textContent).toContain('body.cf-cplace-admin-access #cplace');
    });

    it('is idempotent — calling twice creates only one style element', () => {
      mod.apply();
      mod.apply();
      const styles = document.querySelectorAll('#cplace-admin-access-highlight-style');
      expect(styles.length).toBe(1);
    });

    it('falls back to documentElement when head is absent', () => {
      document.head.remove();
      mod.apply();
      const style = document.getElementById('cplace-admin-access-highlight-style');
      expect(style).not.toBeNull();
      expect(document.documentElement.contains(style)).toBe(true);
    });
  });

  describe('revert()', () => {
    it('removes the style element after apply', () => {
      mod.apply();
      mod.revert();
      expect(document.getElementById('cplace-admin-access-highlight-style')).toBeNull();
    });

    it('is idempotent — safe to call when not applied', () => {
      expect(() => mod.revert()).not.toThrow();
    });
  });
});
