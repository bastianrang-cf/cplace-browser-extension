// Reusable keyboard-shortcut recorder control, shared by the Options page's
// per-module shortcut editor and feature editors that need their own bindings
// (e.g. Navigation Links per-link shortcuts).
//
// Storage-agnostic: the caller supplies the current combo, a persist callback,
// and an optional conflict resolver, so the same control backs both
// moduleShortcutsItem (module commands) and any feature-owned binding without a
// second recording implementation.

import {
  comboToDisplay,
  eventToCombo,
  isValidCombo,
  reservedConflict,
  editorComboWarning,
} from './shortcuts.js';

// Build the recorder button, a Clear button, and a warning line, wired into a
// click-to-record state machine.
//
//   platform            'mac' | 'other'
//   getCombo()          -> the current stored combo or null
//   onSave(combo|null)  -> persist the combo (null clears); may return a promise
//   findConflict(combo) -> optional; a duplicate-binding warning string or null
//
// Returns { recorder, clearBtn, warning, refresh }. The caller arranges the
// three elements (the Options page keeps its historical grid layout; feature
// editors inline them), and may call refresh() after the backing store loads.
export function createShortcutRecorder({ platform, getCombo, onSave, findConflict }) {
  const recorder = document.createElement('button');
  recorder.type = 'button';
  recorder.className = 'module-shortcut__recorder';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'module-shortcut__clear';
  clearBtn.textContent = 'Clear';

  const warning = document.createElement('p');
  warning.className = 'module-shortcut__warning';
  warning.hidden = true;

  function showWarning(text) {
    if (text) {
      warning.textContent = text;
      warning.hidden = false;
    } else {
      warning.textContent = '';
      warning.hidden = true;
    }
  }

  function refresh() {
    const combo = getCombo();
    if (combo) {
      recorder.textContent = comboToDisplay(combo, platform);
      recorder.classList.add('is-set');
      clearBtn.hidden = false;
      const dup = findConflict ? findConflict(combo) : null;
      showWarning(dup || reservedConflict(combo, platform) || editorComboWarning(combo, platform));
    } else {
      recorder.textContent = 'Set shortcut';
      recorder.classList.remove('is-set');
      clearBtn.hidden = true;
      showWarning(null);
    }
  }

  let recording = false;
  let onKey = null;

  function stopRecording() {
    recording = false;
    recorder.classList.remove('is-recording');
    if (onKey) {
      document.removeEventListener('keydown', onKey, true);
      onKey = null;
    }
    refresh();
  }

  function startRecording() {
    if (recording) return;
    recording = true;
    recorder.classList.add('is-recording');
    recorder.textContent = 'Press keys…';
    clearBtn.hidden = true;
    showWarning(null);
    onKey = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') {
        stopRecording();
        return;
      }
      const combo = eventToCombo(event, platform);
      if (!combo) return; // standalone modifier — keep waiting
      if (!isValidCombo(combo)) {
        recorder.textContent = comboToDisplay(combo, platform) || '…';
        showWarning(platform === 'mac'
          ? 'Add ⌘ or ⌥ — a modifier is required.'
          : 'Add Ctrl or Alt — a modifier is required.');
        return;
      }
      stopRecording();
      Promise.resolve(onSave(combo)).then(refresh);
    };
    document.addEventListener('keydown', onKey, true);
  }

  recorder.addEventListener('click', () => {
    if (recording) stopRecording();
    else startRecording();
  });
  recorder.addEventListener('blur', () => { if (recording) stopRecording(); });
  clearBtn.addEventListener('click', () => {
    Promise.resolve(onSave(null)).then(refresh);
  });

  refresh();
  return { recorder, clearBtn, warning, refresh };
}
