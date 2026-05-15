import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(fakeBrowser.runtime, 'getURL').mockImplementation((path) => `chrome-extension://test/${path}`);
  document.documentElement.innerHTML = '<head></head><body></body>';
});

afterEach(() => {
  vi.useRealTimers();
});

async function loadMod() {
  vi.resetModules();
  const { default: mod } = await import('./index.js');
  return mod;
}

describe('batch-jobs module', () => {
  it('has correct id', async () => {
    const mod = await loadMod();
    expect(mod.id).toBe('batch-jobs');
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

  describe('apply()', () => {
    it('is idempotent — calling twice does not double-register intervals', async () => {
      vi.useFakeTimers();
      const mod = await loadMod();
      mod.apply();
      mod.apply();
      expect(vi.getTimerCount()).toBe(2);
      mod.revert();
    });
  });

  describe('revert()', () => {
    it('is safe to call when not applied', async () => {
      const mod = await loadMod();
      expect(() => mod.revert()).not.toThrow();
    });

    it('removes the panel element after apply', async () => {
      const mod = await loadMod();
      mod.apply();

      document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', {
        detail: {
          rows: [{
            id: 'persistentJob_abc123',
            html: `<tr><td cplace-control='{"name":"Test Job","startedAt":${Date.now() - 5000}}'></td></tr>`,
          }],
          total: 1,
          tenantPath: '/training/',
        },
      }));

      expect(document.getElementById('cplace-batch-jobs-panel')).not.toBeNull();

      mod.revert();

      expect(document.getElementById('cplace-batch-jobs-panel')).toBeNull();
    });

    it('clears both intervals', async () => {
      vi.useFakeTimers();
      const mod = await loadMod();
      mod.apply();
      expect(vi.getTimerCount()).toBe(2);
      mod.revert();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe('renderPanel via result event', () => {
    it('hides overlay when no jobs returned', async () => {
      const mod = await loadMod();
      mod.apply();

      document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', {
        detail: { rows: [], total: 0, tenantPath: '/training/' },
      }));

      expect(document.getElementById('cplace-batch-jobs-panel')).toBeNull();
      mod.revert();
    });

    it('shows badge with job count when jobs are returned', async () => {
      const mod = await loadMod();
      mod.apply();

      document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', {
        detail: {
          rows: [
            {
              id: 'persistentJob_job1',
              html: `<tr><td cplace-control='{"name":"Job One","startedAt":${Date.now() - 3000}}'></td></tr>`,
            },
            {
              id: 'persistentJob_job2',
              html: `<tr><td cplace-control='{"name":"Job Two","startedAt":${Date.now() - 6000}}'></td></tr>`,
            },
          ],
          total: 2,
          tenantPath: '/training/',
        },
      }));

      const panel = document.getElementById('cplace-batch-jobs-panel');
      expect(panel).not.toBeNull();
      const badge = panel.querySelector('.cplace-bj-badge');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toContain('2');

      mod.revert();
    });
  });
});
