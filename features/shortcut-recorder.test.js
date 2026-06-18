import { describe, it, expect, vi } from 'vitest';
import { createShortcutRecorder } from './shortcut-recorder.js';

function press(code, extra = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...extra }));
}

describe('createShortcutRecorder', () => {
  it('shows "Set shortcut" and hides Clear when no combo is set', () => {
    const { recorder, clearBtn } = createShortcutRecorder({
      platform: 'other',
      getCombo: () => null,
      onSave: () => {},
    });
    expect(recorder.textContent).toBe('Set shortcut');
    expect(recorder.classList.contains('is-set')).toBe(false);
    expect(clearBtn.hidden).toBe(true);
  });

  it('renders the stored combo with platform glyphs and reveals Clear', () => {
    const { recorder, clearBtn } = createShortcutRecorder({
      platform: 'other',
      getCombo: () => ({ mod: true, code: 'KeyY' }),
      onSave: () => {},
    });
    expect(recorder.textContent).toBe('Ctrl+Y');
    expect(recorder.classList.contains('is-set')).toBe(true);
    expect(clearBtn.hidden).toBe(false);
  });

  it('records a valid combo and persists it', async () => {
    let stored = null;
    const onSave = vi.fn((combo) => { stored = combo; });
    const { recorder } = createShortcutRecorder({
      platform: 'other',
      getCombo: () => stored,
      onSave,
    });

    recorder.dispatchEvent(new Event('click'));
    expect(recorder.classList.contains('is-recording')).toBe(true);

    press('KeyY', { ctrlKey: true });
    expect(onSave).toHaveBeenCalledWith({ mod: true, alt: false, shift: false, code: 'KeyY' });

    for (let i = 0; i < 3; i++) await Promise.resolve();
    expect(recorder.classList.contains('is-recording')).toBe(false);
    expect(recorder.textContent).toBe('Ctrl+Y');
  });

  it('warns and keeps waiting on a modifier-less combo', () => {
    const onSave = vi.fn();
    const { recorder, warning } = createShortcutRecorder({
      platform: 'other',
      getCombo: () => null,
      onSave,
    });

    recorder.dispatchEvent(new Event('click'));
    press('KeyY', { shiftKey: true }); // shift alone is not a valid modifier
    expect(onSave).not.toHaveBeenCalled();
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toMatch(/Ctrl or Alt/);

    recorder.dispatchEvent(new Event('blur')); // stop recording (cleanup)
  });

  it('cancels recording on Escape without saving', () => {
    const onSave = vi.fn();
    const { recorder } = createShortcutRecorder({
      platform: 'other',
      getCombo: () => null,
      onSave,
    });

    recorder.dispatchEvent(new Event('click'));
    press('Escape');
    expect(onSave).not.toHaveBeenCalled();
    expect(recorder.classList.contains('is-recording')).toBe(false);
    expect(recorder.textContent).toBe('Set shortcut');
  });

  it('clears the combo via the Clear button', () => {
    let stored = { mod: true, code: 'KeyY' };
    const onSave = vi.fn((combo) => { stored = combo; });
    const { clearBtn } = createShortcutRecorder({
      platform: 'other',
      getCombo: () => stored,
      onSave,
    });

    clearBtn.dispatchEvent(new Event('click'));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('surfaces a duplicate-binding conflict from findConflict', () => {
    const { warning } = createShortcutRecorder({
      platform: 'other',
      getCombo: () => ({ mod: true, code: 'KeyY' }),
      onSave: () => {},
      findConflict: () => 'Also bound to Something.',
    });
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toBe('Also bound to Something.');
  });

  it('falls back to a reserved/editor warning when there is no duplicate', () => {
    const { warning } = createShortcutRecorder({
      platform: 'other',
      getCombo: () => ({ mod: true, code: 'KeyT' }), // Ctrl+T → new tab
      onSave: () => {},
      findConflict: () => null,
    });
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toMatch(/New tab/);
  });
});
