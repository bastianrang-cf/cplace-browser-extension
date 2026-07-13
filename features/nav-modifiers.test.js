import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  MODIFIER_CHOICES,
  DEFAULT_NAV_MODIFIERS,
  normalizeNavModifiers,
  modifierPressed,
  modifierLabel,
  modifierGlyph,
  openTarget,
  renderNavModifierOptions,
} from './nav-modifiers.js';

describe('normalizeNavModifiers', () => {
  it('returns the defaults for an empty object', () => {
    expect(normalizeNavModifiers({})).toEqual({ secondaryModifier: 'alt', newTabModifier: 'shift' });
  });

  it('returns the defaults for undefined/null', () => {
    expect(normalizeNavModifiers()).toEqual(DEFAULT_NAV_MODIFIERS);
    expect(normalizeNavModifiers(null)).toEqual(DEFAULT_NAV_MODIFIERS);
  });

  it('keeps valid values', () => {
    expect(normalizeNavModifiers({ secondaryModifier: 'ctrl', newTabModifier: 'meta' })).toEqual({
      secondaryModifier: 'ctrl',
      newTabModifier: 'meta',
    });
  });

  it('falls back to the default for an invalid value', () => {
    expect(normalizeNavModifiers({ secondaryModifier: 'bogus', newTabModifier: 'shift' })).toEqual({
      secondaryModifier: 'alt',
      newTabModifier: 'shift',
    });
  });

  it('only accepts values from MODIFIER_CHOICES', () => {
    expect(MODIFIER_CHOICES).toEqual(['alt', 'shift', 'ctrl', 'meta']);
  });
});

describe('modifierPressed', () => {
  it('maps each modifier to the matching event flag', () => {
    expect(modifierPressed({ altKey: true }, 'alt')).toBe(true);
    expect(modifierPressed({ shiftKey: true }, 'shift')).toBe(true);
    expect(modifierPressed({ ctrlKey: true }, 'ctrl')).toBe(true);
    expect(modifierPressed({ metaKey: true }, 'meta')).toBe(true);
  });

  it('returns false when the flag is not set', () => {
    expect(modifierPressed({ altKey: false }, 'alt')).toBe(false);
    expect(modifierPressed({}, 'shift')).toBe(false);
  });

  it('returns false for an unknown modifier', () => {
    expect(modifierPressed({ altKey: true }, 'bogus')).toBe(false);
  });
});

describe('modifierLabel', () => {
  it('renders platform-specific labels on macOS', () => {
    expect(modifierLabel('alt', 'mac')).toBe('Option (⌥)');
    expect(modifierLabel('shift', 'mac')).toBe('Shift (⇧)');
    expect(modifierLabel('ctrl', 'mac')).toBe('Control (⌃)');
    expect(modifierLabel('meta', 'mac')).toBe('Command (⌘)');
  });

  it('renders Windows/Linux labels otherwise', () => {
    expect(modifierLabel('alt', 'other')).toBe('Alt');
    expect(modifierLabel('shift', 'other')).toBe('Shift');
    expect(modifierLabel('ctrl', 'other')).toBe('Ctrl');
    expect(modifierLabel('meta', 'other')).toBe('Win');
  });
});

describe('modifierGlyph', () => {
  it('uses glyphs on macOS and words elsewhere', () => {
    expect(modifierGlyph('alt', 'mac')).toBe('⌥');
    expect(modifierGlyph('shift', 'mac')).toBe('⇧');
    expect(modifierGlyph('meta', 'mac')).toBe('⌘');
    expect(modifierGlyph('alt', 'other')).toBe('Alt');
    expect(modifierGlyph('shift', 'other')).toBe('Shift');
    expect(modifierGlyph('meta', 'other')).toBe('Win');
  });
});

describe('openTarget', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('navigates the current tab when newTab is false', () => {
    const hrefSpy = vi.spyOn(window.location, 'href', 'set').mockImplementation(() => {});
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    openTarget('https://x.example/acme/page', false);
    expect(hrefSpy).toHaveBeenCalledWith('https://x.example/acme/page');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('opens a new tab when newTab is true', () => {
    const hrefSpy = vi.spyOn(window.location, 'href', 'set').mockImplementation(() => {});
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    openTarget('https://x.example/acme/page', true);
    expect(openSpy).toHaveBeenCalledWith('https://x.example/acme/page', '_blank', 'noopener,noreferrer');
    expect(hrefSpy).not.toHaveBeenCalled();
  });
});

describe('renderNavModifierOptions', () => {
  function makeCtx(initial) {
    let stored = initial;
    return {
      saved: () => stored,
      getOptions: () => stored,
      setOptions: (next) => {
        stored = next;
      },
      getDefaults: () => ({ ...DEFAULT_NAV_MODIFIERS }),
    };
  }

  it('renders two selects seeded from the current options', () => {
    const container = document.createElement('div');
    const ctx = makeCtx({ secondaryModifier: 'ctrl', newTabModifier: 'shift' });
    renderNavModifierOptions(container, ctx, { secondaryLabel: 'Secondary', newTabLabel: 'New tab' });

    const selects = container.querySelectorAll('select');
    expect(selects.length).toBe(2);
    expect([...selects[0].options].map((o) => o.value)).toEqual(MODIFIER_CHOICES);
    expect(selects[0].value).toBe('ctrl');
    expect(selects[1].value).toBe('shift');
  });

  it('persists the whole normalized object when a select changes', () => {
    const container = document.createElement('div');
    const ctx = makeCtx({});
    renderNavModifierOptions(container, ctx, { secondaryLabel: 'Secondary', newTabLabel: 'New tab' });

    const [secondary] = container.querySelectorAll('select');
    secondary.value = 'meta';
    secondary.dispatchEvent(new Event('change'));

    expect(ctx.saved()).toEqual({ secondaryModifier: 'meta', newTabModifier: 'shift' });
  });

  it('shows a note when both modifiers resolve to the same key', () => {
    const container = document.createElement('div');
    const ctx = makeCtx({ secondaryModifier: 'shift', newTabModifier: 'shift' });
    renderNavModifierOptions(container, ctx, { secondaryLabel: 'Secondary', newTabLabel: 'New tab' });

    const note = container.querySelector('.module-option-note');
    expect(note).not.toBeNull();
    expect(note.hidden).toBe(false);
  });
});
