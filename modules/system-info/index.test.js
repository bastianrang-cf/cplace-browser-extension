import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  document.documentElement.innerHTML = '<head></head><body></body>';
});

async function loadMod() {
  vi.resetModules();
  const { default: mod } = await import('./index.js');
  return mod;
}

const sampleData = {
  mainBuildIdentifier: {
    name: 'cplace-ga-products',
    release: '25.4',
    changeSetId: 'af300a5',
    buildTime: '2026-05-11-222104',
  },
  buildIdentifiers: [
    { name: 'cplace', release: '25.4', changeSetId: 'e9f8704', buildTime: '2026-05-11-220415' },
    { name: 'cplace-rest', release: '25.4', changeSetId: '5a701a6', buildTime: '2026-05-11-221635' },
  ],
  mayViewAllSystemInfo: true,
  systemStatusUrl: '/training/application/administrationDashboard/viewSystemStatus',
  fossPageUrl: '/training/application/administrationDashboard/viewLibraries/viewLibraries',
};

describe('system-info module', () => {
  it('has correct id', async () => {
    const mod = await loadMod();
    expect(mod.id).toBe('system-info');
  });

  it('is disabled by default', async () => {
    const mod = await loadMod();
    expect(mod.defaultEnabled).toBe(false);
  });

  it('has css and pageScript flags set', async () => {
    const mod = await loadMod();
    expect(mod.css).toBe(true);
    expect(mod.pageScript).toBe(true);
  });

  it('declares the System Info popup action', async () => {
    const mod = await loadMod();
    expect(mod.actions).toEqual([{ id: 'show-system-info', label: 'System Info' }]);
  });

  describe('onAction', () => {
    it('dispatches cplace:fetchSystemInfo when the show action is invoked', async () => {
      const mod = await loadMod();
      const spy = vi.fn();
      document.addEventListener('cplace:fetchSystemInfo', spy);
      mod.onAction('show-system-info');
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('ignores unknown actions', async () => {
      const mod = await loadMod();
      const spy = vi.fn();
      document.addEventListener('cplace:fetchSystemInfo', spy);
      mod.onAction('something-else');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('apply()', () => {
    it('is idempotent — calling twice still results in a single dialog on result', async () => {
      const mod = await loadMod();
      mod.apply();
      mod.apply();
      document.dispatchEvent(new CustomEvent('cplace:systemInfoResult', {
        detail: { data: sampleData, error: null },
      }));
      expect(document.querySelectorAll('#cplace-system-info-dialog').length).toBe(1);
      mod.revert();
    });
  });

  describe('revert()', () => {
    it('is safe to call when not applied', async () => {
      const mod = await loadMod();
      expect(() => mod.revert()).not.toThrow();
    });

    it('removes the dialog and stops listening for results', async () => {
      const mod = await loadMod();
      mod.apply();
      document.dispatchEvent(new CustomEvent('cplace:systemInfoResult', {
        detail: { data: sampleData, error: null },
      }));
      expect(document.getElementById('cplace-system-info-dialog')).not.toBeNull();

      mod.revert();
      expect(document.getElementById('cplace-system-info-dialog')).toBeNull();

      document.dispatchEvent(new CustomEvent('cplace:systemInfoResult', {
        detail: { data: sampleData, error: null },
      }));
      expect(document.getElementById('cplace-system-info-dialog')).toBeNull();
    });
  });

  describe('result rendering', () => {
    it('renders the main build identifier and a row per build identifier', async () => {
      const mod = await loadMod();
      mod.apply();
      document.dispatchEvent(new CustomEvent('cplace:systemInfoResult', {
        detail: { data: sampleData, error: null },
      }));
      const dialog = document.getElementById('cplace-system-info-dialog');
      expect(dialog).not.toBeNull();
      expect(dialog.textContent).toContain('cplace-ga-products');
      expect(dialog.textContent).toContain('af300a5');
      const rows = dialog.querySelectorAll('.cplace-si-table tbody tr');
      expect(rows.length).toBe(sampleData.buildIdentifiers.length);
      expect(rows[0].textContent).toContain('cplace');
      expect(rows[1].textContent).toContain('cplace-rest');
      mod.revert();
    });

    it('renders the foss + system-status links when allowed', async () => {
      const mod = await loadMod();
      mod.apply();
      document.dispatchEvent(new CustomEvent('cplace:systemInfoResult', {
        detail: { data: sampleData, error: null },
      }));
      const links = document.querySelectorAll('#cplace-system-info-dialog .cplace-si-links a');
      expect(links.length).toBe(2);
      expect(Array.from(links).map((a) => a.textContent)).toEqual([
        'System status',
        'Open source libraries',
      ]);
      mod.revert();
    });

    it('omits the links section when mayViewAllSystemInfo is false', async () => {
      const mod = await loadMod();
      mod.apply();
      document.dispatchEvent(new CustomEvent('cplace:systemInfoResult', {
        detail: { data: { ...sampleData, mayViewAllSystemInfo: false }, error: null },
      }));
      expect(document.querySelector('#cplace-system-info-dialog .cplace-si-links')).toBeNull();
      mod.revert();
    });

    it('shows the error message on failure', async () => {
      const mod = await loadMod();
      mod.apply();
      document.dispatchEvent(new CustomEvent('cplace:systemInfoResult', {
        detail: { data: null, error: 'HTTP 500 Server Error' },
      }));
      const err = document.querySelector('#cplace-system-info-dialog .cplace-si-error');
      expect(err).not.toBeNull();
      expect(err.textContent).toContain('HTTP 500 Server Error');
      mod.revert();
    });

    it('closes when Escape is pressed', async () => {
      const mod = await loadMod();
      mod.apply();
      document.dispatchEvent(new CustomEvent('cplace:systemInfoResult', {
        detail: { data: sampleData, error: null },
      }));
      expect(document.getElementById('cplace-system-info-dialog')).not.toBeNull();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(document.getElementById('cplace-system-info-dialog')).toBeNull();
      mod.revert();
    });

    it('closes when the close button is clicked', async () => {
      const mod = await loadMod();
      mod.apply();
      document.dispatchEvent(new CustomEvent('cplace:systemInfoResult', {
        detail: { data: sampleData, error: null },
      }));
      const closeBtn = document.querySelector('#cplace-system-info-dialog .cplace-si-close');
      closeBtn.click();
      expect(document.getElementById('cplace-system-info-dialog')).toBeNull();
      mod.revert();
    });
  });
});
