import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  document.documentElement.innerHTML = '<head></head><body></body>';
  window.history.pushState(null, '', '/');
});

async function loadMod() {
  vi.resetModules();
  const { default: mod, definitionUrl, attributesUrl, parseCurrentTypeUid, matchesQuery } = await import('./index.js');
  return { mod, definitionUrl, attributesUrl, parseCurrentTypeUid, matchesQuery };
}

const sampleTypes = [
  { uid: 'uid-1', internalName: 'TypeA', name: 'Type A', icon: '' },
  { uid: 'uid-2', internalName: 'TypeB', name: 'Type B', icon: '' },
  { uid: 'uid-3', internalName: 'AnotherType', name: 'Zeta Type', icon: '' },
];

function dispatchResult(types, error = null) {
  document.dispatchEvent(new CustomEvent('cplace:typesListResult', { detail: { types, error } }));
}

describe('types-list pure helpers', () => {
  it('definitionUrl builds the type definition page URL', async () => {
    const { definitionUrl } = await loadMod();
    expect(definitionUrl('https://x.example/acme', { uid: 'uid-1', internalName: 'TypeA' })).toBe(
      'https://x.example/acme/typeDefinitions/uid-1/TypeA',
    );
  });

  it('attributesUrl builds the attributes page URL', async () => {
    const { attributesUrl } = await loadMod();
    expect(attributesUrl('https://x.example/acme', { uid: 'uid-1', internalName: 'TypeA' })).toBe(
      'https://x.example/acme/typeDefinition/attributes?id=uid-1',
    );
  });

  it('URL builders encode uid/internalName', async () => {
    const { definitionUrl, attributesUrl } = await loadMod();
    const item = { uid: 'uid 1/2', internalName: 'Type A/B' };
    expect(definitionUrl('https://x.example/acme', item)).toBe(
      'https://x.example/acme/typeDefinitions/uid%201%2F2/Type%20A%2FB',
    );
    expect(attributesUrl('https://x.example/acme', item)).toBe(
      'https://x.example/acme/typeDefinition/attributes?id=uid%201%2F2',
    );
  });

  it('matchesQuery matches the display name case-insensitively', async () => {
    const { matchesQuery } = await loadMod();
    expect(matchesQuery({ name: 'Type A', internalName: 'TypeA' }, 'type a')).toBe(true);
    expect(matchesQuery({ name: 'Type A', internalName: 'TypeA' }, 'zzz')).toBe(false);
  });

  it('matchesQuery also matches the internal name', async () => {
    const { matchesQuery } = await loadMod();
    expect(matchesQuery({ name: 'Zeta Type', internalName: 'AnotherType' }, 'another')).toBe(true);
  });

  it('parseCurrentTypeUid extracts the uid from a type definition page path', async () => {
    const { parseCurrentTypeUid } = await loadMod();
    expect(parseCurrentTypeUid('/acme/typeDefinitions/uid-2/TypeB', '')).toBe('uid-2');
  });

  it('parseCurrentTypeUid extracts the uid from an attributes page query', async () => {
    const { parseCurrentTypeUid } = await loadMod();
    expect(parseCurrentTypeUid('/acme/typeDefinition/attributes', '?id=uid-3')).toBe('uid-3');
  });

  it('parseCurrentTypeUid returns null on an unrelated page', async () => {
    const { parseCurrentTypeUid } = await loadMod();
    expect(parseCurrentTypeUid('/acme/pages/somePage', '')).toBeNull();
  });
});

describe('types-list module', () => {
  it('has correct id', async () => {
    const { mod } = await loadMod();
    expect(mod.id).toBe('types-list');
  });

  it('is disabled by default', async () => {
    const { mod } = await loadMod();
    expect(mod.defaultEnabled).toBe(false);
  });

  it('has css and pageScript flags set', async () => {
    const { mod } = await loadMod();
    expect(mod.css).toBe(true);
    expect(mod.pageScript).toBe(true);
  });

  it('declares the Types List popup action', async () => {
    const { mod } = await loadMod();
    expect(mod.actions).toEqual([{ id: 'show-types-list', label: 'Types List', icon: '🗂️' }]);
  });

  describe('onAction', () => {
    it('dispatches cplace:fetchTypesList with the tenant base URL', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      const spy = vi.fn();
      document.addEventListener('cplace:fetchTypesList', spy);
      mod.onAction('show-types-list');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0].detail).toEqual({ baseUrl: 'https://x.example/acme' });
      mod.revert();
    });

    it('ignores unknown actions', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      const spy = vi.fn();
      document.addEventListener('cplace:fetchTypesList', spy);
      mod.onAction('something-else');
      expect(spy).not.toHaveBeenCalled();
      mod.revert();
    });

    it('opens the dialog in a loading state immediately', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-types-list');
      const dialog = document.getElementById('cplace-types-list-dialog');
      expect(dialog).not.toBeNull();
      expect(dialog.querySelector('.cplace-tl-list').textContent).toContain('Loading types');
      mod.revert();
    });
  });

  describe('apply()/revert()', () => {
    it('apply is idempotent', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-types-list');
      dispatchResult(sampleTypes);
      expect(document.querySelectorAll('#cplace-types-list-dialog').length).toBe(1);
      mod.revert();
    });

    it('revert is safe to call when not applied', async () => {
      const { mod } = await loadMod();
      expect(() => mod.revert()).not.toThrow();
    });

    it('revert removes the dialog and stops listening for results', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-types-list');
      dispatchResult(sampleTypes);
      expect(document.getElementById('cplace-types-list-dialog')).not.toBeNull();

      mod.revert();
      expect(document.getElementById('cplace-types-list-dialog')).toBeNull();

      mod.onAction('show-types-list');
      expect(document.getElementById('cplace-types-list-dialog')).toBeNull();
    });
  });

  describe('result rendering', () => {
    it('renders the list sorted by display name', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-types-list');
      dispatchResult(sampleTypes);
      const rows = document.querySelectorAll('#cplace-types-list-dialog .cplace-tl-item');
      expect(rows.length).toBe(3);
      expect([...rows].map((r) => r.querySelector('.cplace-tl-name').textContent)).toEqual([
        'Type A',
        'Type B',
        'Zeta Type',
      ]);
      mod.revert();
    });

    it('shows "No types found" for an empty result', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-types-list');
      dispatchResult([]);
      expect(document.querySelector('#cplace-types-list-dialog .cplace-tl-list').textContent).toContain(
        'No types found',
      );
      mod.revert();
    });

    it('shows the error message when the result has an error', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-types-list');
      dispatchResult(null, 'Open a workspace first');
      const err = document.querySelector('#cplace-types-list-dialog .cplace-tl-error');
      expect(err).not.toBeNull();
      expect(err.textContent).toBe('Open a workspace first');
      mod.revert();
    });

    it('quicksearch filters by display name and internal name', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-types-list');
      dispatchResult(sampleTypes);

      const input = document.querySelector('#cplace-types-list-dialog .cplace-tl-input');
      input.value = 'another';
      input.dispatchEvent(new Event('input'));

      const rows = document.querySelectorAll('#cplace-types-list-dialog .cplace-tl-item');
      expect(rows.length).toBe(1);
      expect(rows[0].querySelector('.cplace-tl-name').textContent).toBe('Zeta Type');
      mod.revert();
    });

    it('preselects the current page\'s type when the search box is empty', async () => {
      window.history.pushState(null, '', '/acme/typeDefinitions/uid-2/TypeB');
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-types-list');
      dispatchResult(sampleTypes);

      const selected = document.querySelector('#cplace-types-list-dialog .cplace-tl-item.sel');
      expect(selected.querySelector('.cplace-tl-name').textContent).toBe('Type B');
      mod.revert();
    });

    it('ArrowDown/ArrowUp move the selection', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-types-list');
      dispatchResult(sampleTypes);

      const input = document.querySelector('#cplace-types-list-dialog .cplace-tl-input');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      let selected = document.querySelector('#cplace-types-list-dialog .cplace-tl-item.sel');
      expect(selected.querySelector('.cplace-tl-name').textContent).toBe('Type B');

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      selected = document.querySelector('#cplace-types-list-dialog .cplace-tl-item.sel');
      expect(selected.querySelector('.cplace-tl-name').textContent).toBe('Type A');
      mod.revert();
    });

    it('Escape closes the dialog', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-types-list');
      dispatchResult(sampleTypes);
      expect(document.getElementById('cplace-types-list-dialog')).not.toBeNull();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(document.getElementById('cplace-types-list-dialog')).toBeNull();
      mod.revert();
    });

    it('clicking the backdrop closes the dialog', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-types-list');
      dispatchResult(sampleTypes);
      document.querySelector('#cplace-types-list-dialog .cplace-tl-backdrop').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      expect(document.getElementById('cplace-types-list-dialog')).toBeNull();
      mod.revert();
    });
  });

  describe('navigation', () => {
    it('Enter navigates to the type definition page', async () => {
      const hrefSpy = vi.spyOn(window.location, 'href', 'set').mockImplementation(() => {});
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-types-list');
      dispatchResult(sampleTypes);

      const input = document.querySelector('#cplace-types-list-dialog .cplace-tl-input');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(hrefSpy).toHaveBeenCalledWith('https://x.example/acme/typeDefinitions/uid-1/TypeA');
      expect(document.getElementById('cplace-types-list-dialog')).toBeNull();
      mod.revert();
    });

    it('Alt+Enter navigates to the attributes page', async () => {
      const hrefSpy = vi.spyOn(window.location, 'href', 'set').mockImplementation(() => {});
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-types-list');
      dispatchResult(sampleTypes);

      const input = document.querySelector('#cplace-types-list-dialog .cplace-tl-input');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', altKey: true, bubbles: true }));

      expect(hrefSpy).toHaveBeenCalledWith('https://x.example/acme/typeDefinition/attributes?id=uid-1');
      mod.revert();
    });

    it('clicking a row navigates to its definition page', async () => {
      const hrefSpy = vi.spyOn(window.location, 'href', 'set').mockImplementation(() => {});
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-types-list');
      dispatchResult(sampleTypes);

      const rows = document.querySelectorAll('#cplace-types-list-dialog .cplace-tl-item');
      rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(hrefSpy).toHaveBeenCalledWith('https://x.example/acme/typeDefinitions/uid-2/TypeB');
      mod.revert();
    });
  });
});
