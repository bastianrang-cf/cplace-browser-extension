// Shared, platform-aware helpers for the "jump to a target" popups
// (types-list, workspace-list). Both dialogs navigate on Enter / row-click and
// let a held modifier switch the destination or open it in a new tab:
//
//   secondaryModifier — switches the primary Enter/click target to the
//                       feature's "secondary" page (attributes / Datamodel).
//   newTabModifier    — opens the resolved target in a new browser tab instead
//                       of navigating the current one (analogous to
//                       Ctrl/Cmd+Click).
//
// The two are independent and stack: holding both opens the secondary page in a
// new tab. Stored per-feature in moduleOptionsItem as
// { secondaryModifier, newTabModifier } (values from MODIFIER_CHOICES).
import { detectPlatform } from './shortcuts.js';

export const MODIFIER_CHOICES = ['alt', 'shift', 'ctrl', 'meta'];

// Defaults preserve the previous hardcoded behaviour (Alt → secondary page) and
// adopt Shift for the new-tab modifier (issue #167's suggested key).
export const DEFAULT_NAV_MODIFIERS = { secondaryModifier: 'alt', newTabModifier: 'shift' };

// Validate stored options and fill defaults so the runtime is robust even for
// installs whose saved options predate these keys.
export function normalizeNavModifiers(options = {}) {
  const pick = (value, fallback) => (MODIFIER_CHOICES.includes(value) ? value : fallback);
  return {
    secondaryModifier: pick(options?.secondaryModifier, DEFAULT_NAV_MODIFIERS.secondaryModifier),
    newTabModifier: pick(options?.newTabModifier, DEFAULT_NAV_MODIFIERS.newTabModifier),
  };
}

// True when the given modifier key was held during a keyboard/mouse event.
export function modifierPressed(event, modifier) {
  switch (modifier) {
    case 'alt': return !!event?.altKey;
    case 'shift': return !!event?.shiftKey;
    case 'ctrl': return !!event?.ctrlKey;
    case 'meta': return !!event?.metaKey;
    default: return false;
  }
}

// Resolve a keyboard/mouse event into the two navigation flags the jump dialogs
// need, given their stored { secondaryModifier, newTabModifier } options:
//   secondary — the secondary-page modifier was held (attributes / Datamodel)
//   newTab    — the new-tab modifier was held
// The two are independent, so holding a key bound to both sets both flags.
export function resolveNavTarget(event, options) {
  const { secondaryModifier, newTabModifier } = normalizeNavModifiers(options);
  return {
    secondary: modifierPressed(event, secondaryModifier),
    newTab: modifierPressed(event, newTabModifier),
  };
}

// Full, platform-correct label for the options dropdown.
export function modifierLabel(modifier, platform = detectPlatform()) {
  const mac = platform === 'mac';
  switch (modifier) {
    case 'alt': return mac ? 'Option (⌥)' : 'Alt';
    case 'shift': return mac ? 'Shift (⇧)' : 'Shift';
    case 'ctrl': return mac ? 'Control (⌃)' : 'Ctrl';
    case 'meta': return mac ? 'Command (⌘)' : 'Win';
    default: return modifier;
  }
}

// Compact token for the dialog footer hint (glyph on macOS, word elsewhere).
export function modifierGlyph(modifier, platform = detectPlatform()) {
  const mac = platform === 'mac';
  switch (modifier) {
    case 'alt': return mac ? '⌥' : 'Alt';
    case 'shift': return mac ? '⇧' : 'Shift';
    case 'ctrl': return mac ? '⌃' : 'Ctrl';
    case 'meta': return mac ? '⌘' : 'Win';
    default: return modifier;
  }
}

// Open a resolved URL in a new tab or the current one. Content scripts can't use
// browser.tabs.create, so the new-tab path uses a user-gesture window.open
// (mirrors features/nav-links/index.js).
//
// No windowFeatures string is passed: a non-empty one (e.g. 'noopener,noreferrer')
// trips Chrome's popup-window heuristic and opens a separate browser *window*
// instead of a tab. Omitting it opens a real tab, respecting the user's settings.
export function openTarget(url, newTab) {
  if (newTab) {
    try {
      window.open(url, '_blank');
    } catch (_) {
      // popup blocked or no window — nothing to recover
    }
    return;
  }
  window.location.href = url;
}

// Render the two-dropdown editor into the Options page container. `labels`
// supplies the feature-specific wording:
//   { secondaryLabel, newTabLabel }
// Persists the whole options object through ctx.setOptions on every change.
export function renderNavModifierOptions(container, ctx, labels) {
  container.textContent = '';
  const platform = detectPlatform();
  const current = normalizeNavModifiers(ctx.getOptions());

  const note = document.createElement('div');
  note.className = 'module-option-note';
  note.hidden = true;

  function buildSelect(field, labelText) {
    const row = document.createElement('label');
    row.className = 'module-option-row';

    const span = document.createElement('span');
    span.textContent = labelText;

    const select = document.createElement('select');
    for (const choice of MODIFIER_CHOICES) {
      const opt = document.createElement('option');
      opt.value = choice;
      opt.textContent = modifierLabel(choice, platform);
      select.appendChild(opt);
    }
    select.value = current[field];
    select.addEventListener('change', () => {
      current[field] = select.value;
      ctx.setOptions(normalizeNavModifiers(current));
      refreshNote();
    });

    row.append(span, select);
    return row;
  }

  function refreshNote() {
    if (current.secondaryModifier === current.newTabModifier) {
      note.hidden = false;
      note.textContent =
        `Both actions use the same key (${modifierLabel(current.secondaryModifier, platform)}), ` +
        'so holding it triggers both at once.';
    } else {
      note.hidden = true;
    }
  }

  container.append(buildSelect('secondaryModifier', labels.secondaryLabel));
  container.append(buildSelect('newTabModifier', labels.newTabLabel));
  container.append(note);
  refreshNote();
}
