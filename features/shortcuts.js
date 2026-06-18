// Shared, platform-aware keyboard-shortcut helpers for module actions.
//
// Shortcuts are stored in a platform-independent ("logical") form:
//   { mod: boolean, alt: boolean, shift: boolean, code: string }
// where `mod` is the *primary* modifier — Cmd (metaKey) on macOS, Ctrl (ctrlKey)
// on Windows/Linux — and `code` is a layout-independent KeyboardEvent.code
// (e.g. 'KeyL', 'Digit1', 'Comma'). A single stored combo therefore fires
// correctly on both platforms (the CodeMirror/ProseMirror "Mod-" model).
//
// These helpers are intentionally free of DOM/extension globals (navigator is
// the only ambient dependency, and it is injectable) so they are unit-testable.

export const SNOOZE_COMMAND_ID = 'snooze';

const MODIFIER_CODES = new Set([
  'ShiftLeft', 'ShiftRight',
  'ControlLeft', 'ControlRight',
  'AltLeft', 'AltRight',
  'MetaLeft', 'MetaRight',
  'OSLeft', 'OSRight',
  'CapsLock',
]);

// 'mac' | 'other'. Prefers the modern userAgentData.platform, falling back to
// the legacy navigator.platform / userAgent strings.
export function detectPlatform(nav = typeof navigator !== 'undefined' ? navigator : undefined) {
  const hay = (nav?.userAgentData?.platform || nav?.platform || nav?.userAgent || '').toLowerCase();
  return /mac|iphone|ipad|ipod/.test(hay) ? 'mac' : 'other';
}

export function isMac(nav) {
  return detectPlatform(nav) === 'mac';
}

function isBindableCode(code) {
  return !!code && !MODIFIER_CODES.has(code);
}

// Normalize a keydown event into a logical combo, resolving the platform's
// primary modifier (Cmd on mac, Ctrl elsewhere) to `mod`. Returns null for a
// standalone modifier keypress (nothing bindable yet).
export function eventToCombo(event, platform = detectPlatform()) {
  const code = event?.code || '';
  if (!isBindableCode(code)) return null;
  const mac = platform === 'mac';
  return {
    mod: mac ? !!event.metaKey : !!event.ctrlKey,
    alt: !!event.altKey,
    shift: !!event.shiftKey,
    code,
  };
}

// True when an event matches a stored combo on the current platform. The
// non-primary OS modifier (Ctrl on mac, the Win/Meta key on Windows/Linux) is
// never part of our model, so its presence rules out a match — this prevents a
// stray Ctrl on mac from satisfying a ⌘ binding.
export function matchesCombo(event, combo, platform = detectPlatform()) {
  if (!combo?.code || event?.code !== combo.code) return false;
  const mac = platform === 'mac';
  const primaryPressed = mac ? !!event.metaKey : !!event.ctrlKey;
  const reservedOther = mac ? !!event.ctrlKey : !!event.metaKey;
  if (reservedOther) return false;
  return (
    primaryPressed === !!combo.mod &&
    !!event.altKey === !!combo.alt &&
    !!event.shiftKey === !!combo.shift
  );
}

// A combo is bindable only if it has a key and at least one "real" modifier
// (primary or Alt). Shift alone is rejected — Shift+letter is just typing.
export function isValidCombo(combo) {
  return !!combo?.code && (!!combo.mod || !!combo.alt);
}

export function combosEqual(a, b) {
  if (!a || !b) return false;
  return (
    a.code === b.code &&
    !!a.mod === !!b.mod &&
    !!a.alt === !!b.alt &&
    !!a.shift === !!b.shift
  );
}

const CODE_LABELS = {
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Minus: '-', Equal: '=', Backquote: '`',
  Space: 'Space', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab', Backspace: '⌫',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};

// Human-readable label for a KeyboardEvent.code (KeyL → 'L', Digit1 → '1').
export function codeToKeyLabel(code) {
  if (!code) return '';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (CODE_LABELS[code]) return CODE_LABELS[code];
  if (/^F\d{1,2}$/.test(code)) return code;
  return code;
}

// Render a combo with platform-correct glyphs: ⌃⌥⇧⌘ on macOS, Ctrl/Alt/Shift+
// on Windows/Linux.
export function comboToDisplay(combo, platform = detectPlatform()) {
  if (!combo?.code) return '';
  const key = codeToKeyLabel(combo.code);
  if (platform === 'mac') {
    let out = '';
    if (combo.alt) out += '⌥';
    if (combo.shift) out += '⇧';
    if (combo.mod) out += '⌘';
    return out + key;
  }
  const parts = [];
  if (combo.mod) parts.push('Ctrl');
  if (combo.alt) parts.push('Alt');
  if (combo.shift) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

// Known browser/OS reservations we should warn (not block) users away from.
// Returns a human-readable conflict description, or null.
export function reservedConflict(combo, platform = detectPlatform()) {
  if (!combo?.code) return null;
  const key = codeToKeyLabel(combo.code).toUpperCase();
  const onlyMod = combo.mod && !combo.alt && !combo.shift;
  const modShift = combo.mod && combo.shift && !combo.alt;
  const display = comboToDisplay(combo, platform);

  if (platform === 'mac') {
    const modOnly = { W: 'Close tab', T: 'New tab', N: 'New window', L: 'Focus address bar', Q: 'Quit', R: 'Reload', D: 'Bookmark', ',': 'Preferences' };
    if (onlyMod && modOnly[key]) return `${display} is the macOS/Chrome shortcut for “${modOnly[key]}”.`;
    const modShiftMap = { T: 'Reopen closed tab', N: 'New incognito window' };
    if (modShift && modShiftMap[key]) return `${display} is the Chrome shortcut for “${modShiftMap[key]}”.`;
    return null;
  }
  const modOnly = { W: 'Close tab', T: 'New tab', N: 'New window', L: 'Focus address bar', R: 'Reload', D: 'Bookmark', J: 'Open downloads' };
  if (onlyMod && modOnly[key]) return `${display} is the Chrome shortcut for “${modOnly[key]}”.`;
  const modShiftMap = { T: 'Reopen closed tab', N: 'New incognito window', Q: 'Quit' };
  if (modShift && modShiftMap[key]) return `${display} is the Chrome shortcut for “${modShiftMap[key]}”.`;
  return null;
}

// App-level cautions (warn, don't block) that go beyond browser/OS reservations:
//  - common rich-text editor combos (cplace embeds heavy editors), since
//    modifier-bearing shortcuts fire even while the user is typing;
//  - on Windows/Linux, AltGr surfaces as Ctrl+Alt, so a Ctrl+Alt+<key> binding
//    can clash with AltGr-composed characters (e.g. German @ is AltGr+Q).
const EDITOR_KEYS = { B: 'bold', I: 'italic', U: 'underline', K: 'link', Z: 'undo', Y: 'redo', S: 'save' };

export function editorComboWarning(combo, platform = detectPlatform()) {
  if (!combo?.code) return null;
  const display = comboToDisplay(combo, platform);
  if (platform !== 'mac' && combo.mod && combo.alt) {
    return `${display} can clash with AltGr-composed characters on some keyboard layouts.`;
  }
  const key = codeToKeyLabel(combo.code).toUpperCase();
  if (combo.mod && !combo.alt && !combo.shift && EDITOR_KEYS[key]) {
    return `${display} is a common rich-text editor shortcut (${EDITOR_KEYS[key]}) and may not work while typing in cplace editors.`;
  }
  return null;
}

// Enumerate the keyboard-bindable commands for a module descriptor.
//  - snoozable modules expose a single "snooze / unsnooze" command;
//  - otherwise, one command per declared action.
// (A module that is both snoozable and declares actions only exposes the snooze
// command for shortcuts — the per-action popup buttons are unaffected.)
export function bindableCommands(mod) {
  if (!mod) return [];
  if (mod.snoozable) return [{ id: SNOOZE_COMMAND_ID, label: 'Snooze / unsnooze' }];
  if (Array.isArray(mod.actions) && mod.actions.length) {
    return mod.actions.map((a) => ({ id: a.id, label: a.label }));
  }
  return [];
}
