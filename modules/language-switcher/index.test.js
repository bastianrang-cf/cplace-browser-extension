import { describe, it, expect, vi } from 'vitest';
import mod from './index.js';

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

  it('has pageScript flag set', () => {
    expect(mod.pageScript).toBe(true);
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
