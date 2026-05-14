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
  const { default: mod } = await import('../modules/batch-jobs.js');
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

  describe('apply()', () => {
    it('is idempotent — calling twice does not double-register intervals', async () => {
      vi.useFakeTimers();
      const mod = await loadMod();
      mod.apply();
      mod.apply();
      // Only one interval should have been set for polling and one for tick
      expect(vi.getTimerCount()).toBe(2);
      mod.revert();
    });

    it('injects the page-world script into the document', async () => {
      const mod = await loadMod();
      mod.apply();
      const script = document.querySelector('script[data-cplace-batch-jobs]');
      expect(script).not.toBeNull();
      expect(script.src).toContain('batch-jobs-page.js');
      mod.revert();
    });
  });

  describe('revert()', () => {
    it('is safe to call when not applied', async () => {
      const mod = await loadMod();
      expect(() => mod.revert()).not.toThrow();
    });

    it('removes panel and style elements after apply', async () => {
      const mod = await loadMod();
      mod.apply();

      // Simulate a result event with jobs
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
      expect(document.getElementById('cplace-batch-jobs-style')).toBeNull();
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
