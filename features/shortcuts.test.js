import { describe, it, expect } from 'vitest';
import {
  detectPlatform,
  isMac,
  eventToCombo,
  matchesCombo,
  isValidCombo,
  combosEqual,
  codeToKeyLabel,
  comboToDisplay,
  reservedConflict,
  editorComboWarning,
  bindableCommands,
  SNOOZE_COMMAND_ID,
} from './shortcuts.js';

const macNav = { userAgentData: { platform: 'macOS' } };
const winNav = { userAgentData: { platform: 'Windows' } };
const legacyMacNav = { platform: 'MacIntel' };
const legacyWinNav = { platform: 'Win32' };

describe('detectPlatform / isMac', () => {
  it('detects mac from userAgentData.platform', () => {
    expect(detectPlatform(macNav)).toBe('mac');
    expect(isMac(macNav)).toBe(true);
  });

  it('detects non-mac from userAgentData.platform', () => {
    expect(detectPlatform(winNav)).toBe('other');
    expect(isMac(winNav)).toBe(false);
  });

  it('falls back to legacy navigator.platform', () => {
    expect(detectPlatform(legacyMacNav)).toBe('mac');
    expect(detectPlatform(legacyWinNav)).toBe('other');
  });

  it('falls back to userAgent string', () => {
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' })).toBe('mac');
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)' })).toBe('other');
  });

  it('defaults to other for empty navigator', () => {
    expect(detectPlatform({})).toBe('other');
  });
});

describe('eventToCombo', () => {
  it('resolves the primary modifier from metaKey on mac', () => {
    const combo = eventToCombo({ code: 'KeyL', metaKey: true, ctrlKey: false }, 'mac');
    expect(combo).toEqual({ mod: true, alt: false, shift: false, code: 'KeyL' });
  });

  it('resolves the primary modifier from ctrlKey on other platforms', () => {
    const combo = eventToCombo({ code: 'KeyL', ctrlKey: true, metaKey: false }, 'other');
    expect(combo).toEqual({ mod: true, alt: false, shift: false, code: 'KeyL' });
  });

  it('captures alt and shift', () => {
    const combo = eventToCombo({ code: 'KeyK', altKey: true, shiftKey: true }, 'other');
    expect(combo).toEqual({ mod: false, alt: true, shift: true, code: 'KeyK' });
  });

  it('returns null for a standalone modifier keypress', () => {
    expect(eventToCombo({ code: 'ControlLeft', ctrlKey: true }, 'other')).toBeNull();
    expect(eventToCombo({ code: 'MetaRight', metaKey: true }, 'mac')).toBeNull();
    expect(eventToCombo({ code: '' }, 'other')).toBeNull();
  });
});

describe('matchesCombo — cross-platform mod resolution', () => {
  const combo = { mod: true, alt: false, shift: false, code: 'KeyL' };

  it('matches a Cmd+L event on mac', () => {
    expect(matchesCombo({ code: 'KeyL', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }, combo, 'mac')).toBe(true);
  });

  it('does NOT match a Ctrl+L event on mac (mod is Cmd there)', () => {
    expect(matchesCombo({ code: 'KeyL', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false }, combo, 'mac')).toBe(false);
  });

  it('matches a Ctrl+L event on Windows/Linux', () => {
    expect(matchesCombo({ code: 'KeyL', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }, combo, 'other')).toBe(true);
  });

  it('does NOT match a Cmd/Meta+L event on Windows/Linux', () => {
    expect(matchesCombo({ code: 'KeyL', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false }, combo, 'other')).toBe(false);
  });

  it('rejects a mismatched key', () => {
    expect(matchesCombo({ code: 'KeyK', ctrlKey: true }, combo, 'other')).toBe(false);
  });

  it('rejects when an extra modifier is held', () => {
    expect(matchesCombo({ code: 'KeyL', ctrlKey: true, altKey: true }, combo, 'other')).toBe(false);
    expect(matchesCombo({ code: 'KeyL', ctrlKey: true, shiftKey: true }, combo, 'other')).toBe(false);
  });

  it('requires the exact alt/shift combination', () => {
    const altShift = { mod: true, alt: true, shift: true, code: 'KeyP' };
    expect(matchesCombo({ code: 'KeyP', metaKey: true, altKey: true, shiftKey: true }, altShift, 'mac')).toBe(true);
    expect(matchesCombo({ code: 'KeyP', metaKey: true, altKey: true, shiftKey: false }, altShift, 'mac')).toBe(false);
  });
});

describe('isValidCombo', () => {
  it('requires a key and at least a primary or alt modifier', () => {
    expect(isValidCombo({ mod: true, code: 'KeyL' })).toBe(true);
    expect(isValidCombo({ alt: true, code: 'KeyL' })).toBe(true);
    expect(isValidCombo({ shift: true, code: 'KeyL' })).toBe(false);
    expect(isValidCombo({ code: 'KeyL' })).toBe(false);
    expect(isValidCombo({ mod: true })).toBe(false);
    expect(isValidCombo(null)).toBe(false);
  });
});

describe('combosEqual', () => {
  it('compares all fields', () => {
    expect(combosEqual({ mod: true, alt: false, shift: false, code: 'KeyL' }, { mod: true, code: 'KeyL' })).toBe(true);
    expect(combosEqual({ mod: true, code: 'KeyL' }, { mod: true, code: 'KeyK' })).toBe(false);
    expect(combosEqual({ mod: true, code: 'KeyL' }, { mod: true, shift: true, code: 'KeyL' })).toBe(false);
    expect(combosEqual(null, { mod: true, code: 'KeyL' })).toBe(false);
  });
});

describe('codeToKeyLabel', () => {
  it('maps common codes to readable labels', () => {
    expect(codeToKeyLabel('KeyL')).toBe('L');
    expect(codeToKeyLabel('Digit1')).toBe('1');
    expect(codeToKeyLabel('Comma')).toBe(',');
    expect(codeToKeyLabel('Slash')).toBe('/');
    expect(codeToKeyLabel('F5')).toBe('F5');
    expect(codeToKeyLabel('ArrowUp')).toBe('↑');
  });
});

describe('comboToDisplay — platform glyphs', () => {
  it('renders macOS glyphs in canonical order', () => {
    expect(comboToDisplay({ mod: true, code: 'KeyL' }, 'mac')).toBe('⌘L');
    expect(comboToDisplay({ mod: true, alt: true, shift: true, code: 'KeyP' }, 'mac')).toBe('⌥⇧⌘P');
  });

  it('renders Windows/Linux word form', () => {
    expect(comboToDisplay({ mod: true, code: 'KeyL' }, 'other')).toBe('Ctrl+L');
    expect(comboToDisplay({ mod: true, alt: true, shift: true, code: 'KeyP' }, 'other')).toBe('Ctrl+Alt+Shift+P');
  });

  it('returns empty for a combo without a key', () => {
    expect(comboToDisplay({ mod: true }, 'mac')).toBe('');
  });
});

describe('reservedConflict', () => {
  it('warns on macOS ⌘W (close tab)', () => {
    expect(reservedConflict({ mod: true, code: 'KeyW' }, 'mac')).toMatch(/Close tab/);
  });

  it('warns on Windows Ctrl+T (new tab)', () => {
    expect(reservedConflict({ mod: true, code: 'KeyT' }, 'other')).toMatch(/New tab/);
  });

  it('warns on Ctrl+Shift+T (reopen closed tab)', () => {
    expect(reservedConflict({ mod: true, shift: true, code: 'KeyT' }, 'other')).toMatch(/Reopen/);
  });

  it('does not warn on a safe combo', () => {
    expect(reservedConflict({ mod: true, alt: true, code: 'KeyL' }, 'mac')).toBeNull();
    expect(reservedConflict({ mod: true, code: 'KeyY' }, 'other')).toBeNull();
  });
});

describe('editorComboWarning', () => {
  it('warns on common rich-text editor combos (mod-only)', () => {
    expect(editorComboWarning({ mod: true, code: 'KeyB' }, 'mac')).toMatch(/bold/);
    expect(editorComboWarning({ mod: true, code: 'KeyZ' }, 'other')).toMatch(/undo/);
    expect(editorComboWarning({ mod: true, code: 'KeyK' }, 'other')).toMatch(/link/);
  });

  it('warns about AltGr clashes for Ctrl+Alt combos on Windows/Linux', () => {
    expect(editorComboWarning({ mod: true, alt: true, code: 'KeyQ' }, 'other')).toMatch(/AltGr/);
  });

  it('does not raise the AltGr warning on macOS', () => {
    expect(editorComboWarning({ mod: true, alt: true, code: 'KeyQ' }, 'mac')).toBeNull();
  });

  it('does not warn on editor combos that carry extra modifiers', () => {
    expect(editorComboWarning({ mod: true, shift: true, code: 'KeyB' }, 'mac')).toBeNull();
  });

  it('does not warn on a safe combo', () => {
    expect(editorComboWarning({ mod: true, code: 'KeyJ' }, 'other')).toBeNull();
    expect(editorComboWarning({ mod: true, alt: true, code: 'KeyJ' }, 'mac')).toBeNull();
  });
});

describe('bindableCommands', () => {
  it('returns a single snooze command for snoozable modules', () => {
    const cmds = bindableCommands({ id: 'x', snoozable: true, actions: [{ id: 'a', label: 'A' }] });
    expect(cmds).toEqual([{ id: SNOOZE_COMMAND_ID, label: 'Snooze / unsnooze' }]);
  });

  it('returns one command per action for non-snoozable modules', () => {
    const cmds = bindableCommands({ id: 'x', actions: [{ id: 'switch-language', label: 'Switch language' }] });
    expect(cmds).toEqual([{ id: 'switch-language', label: 'Switch language' }]);
  });

  it('returns nothing for a module with neither', () => {
    expect(bindableCommands({ id: 'x' })).toEqual([]);
    expect(bindableCommands(null)).toEqual([]);
  });
});
