import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  document.documentElement.innerHTML = '<head></head><body></body>';
  window.history.pushState(null, '', '/');
});

async function loadMod() {
  vi.resetModules();
  const { default: mod, rootUrl, typesUrl, matchesQuery } = await import('./index.js');
  return { mod, rootUrl, typesUrl, matchesQuery };
}

const sampleWorkspaces = [
  { uid: 'uid-1', name: 'Workspace A', url: 'https://x.example/acme/space/uid-1' },
  { uid: 'uid-2', name: 'Workspace B', url: 'https://x.example/acme/space/uid-2' },
  { uid: 'uid-3', name: 'Zeta Space', url: 'https://x.example/acme/space/uid-3' },
];

function dispatchResult(workspaces, error = null, currentUid = null) {
  document.dispatchEvent(new CustomEvent('cplace:workspaceListResult', { detail: { workspaces, error, currentUid } }));
}

describe('workspace-list pure helpers', () => {
  it('rootUrl returns the item url as-is', async () => {
    const { rootUrl } = await loadMod();
    expect(rootUrl({ uid: 'uid-1', url: 'https://x.example/acme/space/uid-1' })).toBe(
      'https://x.example/acme/space/uid-1',
    );
  });

  it('typesUrl builds the Datamodel/Types page URL', async () => {
    const { typesUrl } = await loadMod();
    expect(typesUrl('https://x.example/acme', { uid: 'uid-1' })).toBe(
      'https://x.example/acme/typeDefinition/listAllTypes?spaceId=uid-1',
    );
  });

  it('typesUrl encodes the workspace uid', async () => {
    const { typesUrl } = await loadMod();
    expect(typesUrl('https://x.example/acme', { uid: 'uid 1/2' })).toBe(
      'https://x.example/acme/typeDefinition/listAllTypes?spaceId=uid%201%2F2',
    );
  });

  it('matchesQuery matches the name case-insensitively', async () => {
    const { matchesQuery } = await loadMod();
    expect(matchesQuery({ name: 'Workspace A' }, 'workspace a')).toBe(true);
    expect(matchesQuery({ name: 'Workspace A' }, 'zzz')).toBe(false);
  });
});

describe('workspace-list module', () => {
  it('has correct id', async () => {
    const { mod } = await loadMod();
    expect(mod.id).toBe('workspace-list');
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

  it('declares the Workspace List popup action', async () => {
    const { mod } = await loadMod();
    expect(mod.actions).toEqual([{ id: 'show-workspace-list', label: 'Workspace List', icon: '🏢' }]);
  });

  describe('onAction', () => {
    it('dispatches cplace:fetchWorkspaceList with the tenant base URL', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      const spy = vi.fn();
      document.addEventListener('cplace:fetchWorkspaceList', spy);
      mod.onAction('show-workspace-list');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0].detail).toEqual({ baseUrl: 'https://x.example/acme' });
      mod.revert();
    });

    it('ignores unknown actions', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      const spy = vi.fn();
      document.addEventListener('cplace:fetchWorkspaceList', spy);
      mod.onAction('something-else');
      expect(spy).not.toHaveBeenCalled();
      mod.revert();
    });

    it('opens the dialog in a loading state immediately', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-workspace-list');
      const dialog = document.getElementById('cplace-workspace-list-dialog');
      expect(dialog).not.toBeNull();
      expect(dialog.querySelector('.cplace-wl-list').textContent).toContain('Loading workspaces');
      mod.revert();
    });
  });

  describe('apply()/revert()', () => {
    it('apply is idempotent', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-workspace-list');
      dispatchResult(sampleWorkspaces);
      expect(document.querySelectorAll('#cplace-workspace-list-dialog').length).toBe(1);
      mod.revert();
    });

    it('revert is safe to call when not applied', async () => {
      const { mod } = await loadMod();
      expect(() => mod.revert()).not.toThrow();
    });

    it('revert removes the dialog and stops listening for results', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-workspace-list');
      dispatchResult(sampleWorkspaces);
      expect(document.getElementById('cplace-workspace-list-dialog')).not.toBeNull();

      mod.revert();
      expect(document.getElementById('cplace-workspace-list-dialog')).toBeNull();

      mod.onAction('show-workspace-list');
      expect(document.getElementById('cplace-workspace-list-dialog')).toBeNull();
    });
  });

  describe('result rendering', () => {
    it('renders the list sorted by name', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-workspace-list');
      dispatchResult(sampleWorkspaces);
      const rows = document.querySelectorAll('#cplace-workspace-list-dialog .cplace-wl-item');
      expect(rows.length).toBe(3);
      expect([...rows].map((r) => r.querySelector('.cplace-wl-name').textContent)).toEqual([
        'Workspace A',
        'Workspace B',
        'Zeta Space',
      ]);
      mod.revert();
    });

    it('shows "No workspaces found" for an empty result', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-workspace-list');
      dispatchResult([]);
      expect(document.querySelector('#cplace-workspace-list-dialog .cplace-wl-list').textContent).toContain(
        'No workspaces found',
      );
      mod.revert();
    });

    it('shows the error message when the result has an error', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-workspace-list');
      dispatchResult(null, 'Open a workspace first');
      const err = document.querySelector('#cplace-workspace-list-dialog .cplace-wl-error');
      expect(err).not.toBeNull();
      expect(err.textContent).toBe('Open a workspace first');
      mod.revert();
    });

    it('quicksearch filters by name', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-workspace-list');
      dispatchResult(sampleWorkspaces);

      const input = document.querySelector('#cplace-workspace-list-dialog .cplace-wl-input');
      input.value = 'zeta';
      input.dispatchEvent(new Event('input'));

      const rows = document.querySelectorAll('#cplace-workspace-list-dialog .cplace-wl-item');
      expect(rows.length).toBe(1);
      expect(rows[0].querySelector('.cplace-wl-name').textContent).toBe('Zeta Space');
      mod.revert();
    });

    it('preselects the current workspace when the search box is empty', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-workspace-list');
      dispatchResult(sampleWorkspaces, null, 'uid-2');

      const selected = document.querySelector('#cplace-workspace-list-dialog .cplace-wl-item.sel');
      expect(selected.querySelector('.cplace-wl-name').textContent).toBe('Workspace B');
      mod.revert();
    });

    it('ArrowDown/ArrowUp move the selection', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-workspace-list');
      dispatchResult(sampleWorkspaces);

      const input = document.querySelector('#cplace-workspace-list-dialog .cplace-wl-input');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      let selected = document.querySelector('#cplace-workspace-list-dialog .cplace-wl-item.sel');
      expect(selected.querySelector('.cplace-wl-name').textContent).toBe('Workspace B');

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      selected = document.querySelector('#cplace-workspace-list-dialog .cplace-wl-item.sel');
      expect(selected.querySelector('.cplace-wl-name').textContent).toBe('Workspace A');
      mod.revert();
    });

    it('Escape closes the dialog', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-workspace-list');
      dispatchResult(sampleWorkspaces);
      expect(document.getElementById('cplace-workspace-list-dialog')).not.toBeNull();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(document.getElementById('cplace-workspace-list-dialog')).toBeNull();
      mod.revert();
    });

    it('clicking the backdrop closes the dialog', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-workspace-list');
      dispatchResult(sampleWorkspaces);
      document.querySelector('#cplace-workspace-list-dialog .cplace-wl-backdrop').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      expect(document.getElementById('cplace-workspace-list-dialog')).toBeNull();
      mod.revert();
    });
  });

  describe('navigation', () => {
    it('Enter navigates to the workspace root page', async () => {
      const hrefSpy = vi.spyOn(window.location, 'href', 'set').mockImplementation(() => {});
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-workspace-list');
      dispatchResult(sampleWorkspaces);

      const input = document.querySelector('#cplace-workspace-list-dialog .cplace-wl-input');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(hrefSpy).toHaveBeenCalledWith('https://x.example/acme/space/uid-1');
      expect(document.getElementById('cplace-workspace-list-dialog')).toBeNull();
      mod.revert();
    });

    it('Alt+Enter navigates to the Datamodel/Types page', async () => {
      const hrefSpy = vi.spyOn(window.location, 'href', 'set').mockImplementation(() => {});
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-workspace-list');
      dispatchResult(sampleWorkspaces);

      const input = document.querySelector('#cplace-workspace-list-dialog .cplace-wl-input');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', altKey: true, bubbles: true }));

      expect(hrefSpy).toHaveBeenCalledWith('https://x.example/acme/typeDefinition/listAllTypes?spaceId=uid-1');
      mod.revert();
    });

    it('clicking a row navigates to its root page', async () => {
      const hrefSpy = vi.spyOn(window.location, 'href', 'set').mockImplementation(() => {});
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-workspace-list');
      dispatchResult(sampleWorkspaces);

      const rows = document.querySelectorAll('#cplace-workspace-list-dialog .cplace-wl-item');
      rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(hrefSpy).toHaveBeenCalledWith('https://x.example/acme/space/uid-2');
      mod.revert();
    });

    it('Shift+Enter opens the root page in a new tab (default new-tab modifier)', async () => {
      const hrefSpy = vi.spyOn(window.location, 'href', 'set').mockImplementation(() => {});
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-workspace-list');
      dispatchResult(sampleWorkspaces);

      const input = document.querySelector('#cplace-workspace-list-dialog .cplace-wl-input');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));

      expect(openSpy).toHaveBeenCalledWith(
        'https://x.example/acme/space/uid-1',
        '_blank',
      );
      expect(hrefSpy).not.toHaveBeenCalled();
      mod.revert();
    });

    it('Alt+Shift+Enter opens the Datamodel/Types page in a new tab', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-workspace-list');
      dispatchResult(sampleWorkspaces);

      const input = document.querySelector('#cplace-workspace-list-dialog .cplace-wl-input');
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', altKey: true, shiftKey: true, bubbles: true }),
      );

      expect(openSpy).toHaveBeenCalledWith(
        'https://x.example/acme/typeDefinition/listAllTypes?spaceId=uid-1',
        '_blank',
      );
      mod.revert();
    });

    it('honors a configured secondary modifier (Ctrl instead of Alt)', async () => {
      const hrefSpy = vi.spyOn(window.location, 'href', 'set').mockImplementation(() => {});
      const { mod } = await loadMod();
      mod.apply({ secondaryModifier: 'ctrl', newTabModifier: 'shift' }, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-workspace-list');
      dispatchResult(sampleWorkspaces);

      const input = document.querySelector('#cplace-workspace-list-dialog .cplace-wl-input');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
      expect(hrefSpy).toHaveBeenLastCalledWith('https://x.example/acme/typeDefinition/listAllTypes?spaceId=uid-1');

      mod.onAction('show-workspace-list');
      dispatchResult(sampleWorkspaces);
      const input2 = document.querySelector('#cplace-workspace-list-dialog .cplace-wl-input');
      input2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', altKey: true, bubbles: true }));
      expect(hrefSpy).toHaveBeenLastCalledWith('https://x.example/acme/space/uid-1');
      mod.revert();
    });
  });

  describe('options & footer', () => {
    it('declares default modifier options', async () => {
      const { mod } = await loadMod();
      expect(mod.defaultOptions).toEqual({ secondaryModifier: 'alt', newTabModifier: 'shift' });
    });

    it('exposes a custom options editor', async () => {
      const { mod } = await loadMod();
      expect(typeof mod.renderOptions).toBe('function');
    });

    it('footer includes a new-tab hint', async () => {
      const { mod } = await loadMod();
      mod.apply({}, { baseUrl: 'https://x.example/acme' });
      mod.onAction('show-workspace-list');
      const foot = document.querySelector('#cplace-workspace-list-dialog .cplace-wl-foot');
      expect(foot.textContent).toContain('new tab');
      expect(foot.textContent).toContain('types page');
      mod.revert();
    });
  });
});
