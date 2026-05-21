import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { batchJobsCacheItem, moduleOptionsItem } from '../storage.js';

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

function rowHtml({ name, href, startedAt, state, duration }) {
  return `
    <tr class="">
      <td cplace-flexi-cell>
        <div cplace-slidable-action>
          <div class="cplace-control-wrapper" cplace-control='${JSON.stringify({ name: 'name', value: name })}'>
            <a class="assetLink" href="${href}">${name}</a>
          </div>
        </div>
      </td>
      <td cplace-flexi-cell>
        <div class="cplace-control-wrapper" cplace-control='${JSON.stringify({ name: 'createdAt' })}'></div>
      </td>
      <td cplace-flexi-cell>
        <div class="cplace-control-wrapper" cplace-control='${JSON.stringify({ name: 'createdBy' })}'></div>
      </td>
      <td cplace-flexi-cell>
        <div class="cplace-control-wrapper" cplace-control='${JSON.stringify({ name: 'startedAt' })}'>
          ${startedAt != null ? `<cplace-timestamp timestamp="${startedAt}"></cplace-timestamp>` : ''}
        </div>
      </td>
      <td cplace-flexi-cell>
        <div class="cplace-control-wrapper" cplace-control='${JSON.stringify({ name: 'state', value: state })}'>
          <span data-status="${state}">${state}</span>
        </div>
      </td>
      <td cplace-flexi-cell>
        <div class="cplace-control-wrapper" cplace-control='${JSON.stringify({ name: 'duration', value: String(duration) })}'></div>
      </td>
    </tr>
  `;
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

    it('does not start polling interval when tab is hidden', async () => {
      vi.useFakeTimers();
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      const mod = await loadMod();
      mod.apply();
      expect(vi.getTimerCount()).toBe(1); // only tickId (elapsed counter), no polling interval
      mod.revert();
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    });

    it('starts polling when tab becomes visible after hidden apply', async () => {
      vi.useFakeTimers();
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      const mod = await loadMod();
      mod.apply();
      expect(vi.getTimerCount()).toBe(1);
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(vi.getTimerCount()).toBe(2); // polling interval added
      mod.revert();
    });

    it('stops polling interval when tab becomes hidden', async () => {
      vi.useFakeTimers();
      const mod = await loadMod();
      mod.apply();
      expect(vi.getTimerCount()).toBe(2);
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(vi.getTimerCount()).toBe(1); // only elapsed counter remains
      mod.revert();
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
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
            html: rowHtml({
              name: 'Test Job',
              href: '/training/batchJob/view?id=abc123',
              startedAt: Date.now() - 5000,
              state: 'running',
              duration: 5000,
            }),
          }],
          total: 1,
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
        detail: { rows: [], total: 0 },
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
              html: rowHtml({
                name: 'Job One', href: '/training/batchJob/view?id=job1',
                startedAt: Date.now() - 3000, state: 'running', duration: 0,
              }),
            },
            {
              id: 'persistentJob_job2',
              html: rowHtml({
                name: 'Job Two', href: '/training/batchJob/view?id=job2',
                startedAt: Date.now() - 6000, state: 'success', duration: 6000,
              }),
            },
          ],
          total: 2,
        },
      }));

      const panel = document.getElementById('cplace-batch-jobs-panel');
      expect(panel).not.toBeNull();
      const badge = panel.querySelector('.cplace-bj-badge');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toBe('Latest 10 Batch jobs ▾');

      mod.revert();
    });

    it('expanded header shows link to batch jobs page', async () => {
      const mod = await loadMod();
      mod.apply({}, {
        version: '25.4',
        origin: 'https://h',
        instance: 'h',
        tenant: 'training',
        baseUrl: 'https://h/training',
        contextPath: '/training/',
      });

      document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', {
        detail: {
          rows: [{
            id: 'persistentJob_job1',
            html: rowHtml({
              name: 'Job One', href: '/training/batchJob/view?id=job1',
              startedAt: Date.now() - 3000, state: 'running', duration: 0,
            }),
          }],
          total: 1,
        },
      }));

      document.querySelector('.cplace-bj-badge').click();

      const headerLink = document.querySelector('.cplace-bj-header a');
      expect(headerLink).not.toBeNull();
      expect(headerLink.textContent).toBe('Latest 10 Batch jobs');
      expect(headerLink.getAttribute('href')).toMatch(/\/training\/batchJob\/jobs$/);
      expect(headerLink.getAttribute('target')).toBe('_blank');

      mod.revert();
    });

    it('renders status icon, name link, and duration text', async () => {
      const mod = await loadMod();
      mod.apply();

      document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', {
        detail: {
          rows: [
            { id: 'persistentJob_done1', html: rowHtml({
              name: 'Low-Code Job "doSomething" (Workspace "Citizen Agentic Innovation Space")', href: '/training/batchJob/view?id=done1',
              startedAt: Date.now() - 60_000, state: 'success', duration: 1500,
            }) },
            { id: 'persistentJob_run1', html: rowHtml({
              name: 'Live Job', href: '/training/batchJob/view?id=run1',
              startedAt: Date.now() - 3000, state: 'running', duration: 0,
            }) },
          ],
          total: 2,
        },
      }));

      document.querySelector('.cplace-bj-badge').click();

      const items = document.querySelectorAll('.cplace-bj-list li');
      expect(items.length).toBe(2);

      const fullName = 'Low-Code Job "doSomething" (Workspace "Citizen Agentic Innovation Space")';
      expect(items[0].querySelector('.cplace-bj-status--success')).not.toBeNull();
      expect(items[0].querySelector('a').textContent).toBe(fullName);
      expect(items[0].querySelector('a').getAttribute('href')).toBe('/training/batchJob/view?id=done1');
      expect(items[0].querySelector('a').getAttribute('title')).toBe(fullName);
      expect(items[0].querySelector('.cplace-bj-workspace').textContent).toBe('Citizen Agentic Innovation Space');
      expect(items[0].querySelector('.cplace-bj-started-at')).not.toBeNull();
      expect(items[0].querySelector('.cplace-bj-elapsed').textContent).toBe('1.5 s');

      // startedAt should appear above elapsed in DOM order within timing column
      const timing0 = items[0].querySelector('.cplace-bj-timing');
      expect(timing0.firstElementChild.classList.contains('cplace-bj-started-at')).toBe(true);
      expect(timing0.lastElementChild.classList.contains('cplace-bj-elapsed')).toBe(true);

      expect(items[1].querySelector('.cplace-bj-status--running')).not.toBeNull();
      expect(items[1].querySelector('.cplace-bj-elapsed').dataset.startedAt).not.toBe('');
      expect(items[1].querySelector('a').getAttribute('title')).toBe('Live Job');

      mod.revert();
    });

    it('caps the rendered list at 10 jobs by default', async () => {
      const mod = await loadMod();
      mod.apply();

      const rows = [];
      for (let i = 0; i < 12; i++) {
        rows.push({
          id: `persistentJob_job${i}`,
          html: rowHtml({
            name: `Job ${i}`, href: `/training/batchJob/view?id=job${i}`,
            startedAt: Date.now() - i * 1000, state: 'success', duration: 100 + i,
          }),
        });
      }

      document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', {
        detail: { rows, total: rows.length },
      }));

      document.querySelector('.cplace-bj-badge').click();

      const items = document.querySelectorAll('.cplace-bj-list li');
      expect(items.length).toBe(10);

      mod.revert();
    });

    it('shows red error element when result contains an error', async () => {
      const mod = await loadMod();
      mod.apply();

      document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', {
        detail: { error: '503 Service Unavailable', rows: [], total: 0 },
      }));

      const panel = document.getElementById('cplace-batch-jobs-panel');
      expect(panel).not.toBeNull();
      const errorEl = panel.querySelector('.cplace-bj-error');
      expect(errorEl).not.toBeNull();
      expect(errorEl.textContent).toContain('503 Service Unavailable');

      mod.revert();
    });

    it('replaces error element with normal panel on successful result', async () => {
      const mod = await loadMod();
      mod.apply();

      document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', {
        detail: { error: 'Network error', rows: [], total: 0 },
      }));
      expect(document.querySelector('.cplace-bj-error')).not.toBeNull();

      document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', {
        detail: {
          rows: [{
            id: 'persistentJob_abc',
            html: rowHtml({
              name: 'Test Job', href: '/training/batchJob/view?id=abc',
              startedAt: Date.now() - 1000, state: 'running', duration: 0,
            }),
          }],
          total: 1,
        },
      }));

      expect(document.querySelector('.cplace-bj-error')).toBeNull();
      expect(document.querySelector('.cplace-bj-badge')).not.toBeNull();

      mod.revert();
    });

    it('writes the result into batchJobsCache keyed by baseUrl', async () => {
      const mod = await loadMod();
      const context = {
        version: '25.4', origin: 'https://h', instance: 'h', tenant: 'training',
        baseUrl: 'https://h/training', contextPath: '/training/',
      };
      mod.apply({}, context);

      const startedAt = Date.now() - 3000;
      document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', {
        detail: {
          rows: [{
            id: 'persistentJob_job1',
            html: rowHtml({
              name: 'Job One', href: '/training/batchJob/view?id=job1',
              startedAt, state: 'running', duration: 0,
            }),
          }],
          total: 1,
        },
      }));

      // Flush microtasks so the async storage write completes
      await new Promise((r) => setTimeout(r, 0));

      const cache = await batchJobsCacheItem.getValue();
      expect(cache[context.baseUrl]).toBeDefined();
      expect(cache[context.baseUrl].rows.length).toBe(1);
      expect(cache[context.baseUrl].total).toBe(1);
      expect(cache[context.baseUrl].error).toBeNull();
      expect(typeof cache[context.baseUrl].timestamp).toBe('number');

      mod.revert();
    });

    it('does not write the cache when the result is an error', async () => {
      const mod = await loadMod();
      const context = {
        baseUrl: 'https://h/training', contextPath: '/training/',
        origin: 'https://h', instance: 'h', tenant: 'training', version: null,
      };
      mod.apply({}, context);

      document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', {
        detail: { error: '503 Service Unavailable', rows: [], total: 0 },
      }));
      await new Promise((r) => setTimeout(r, 0));

      const cache = await batchJobsCacheItem.getValue();
      expect(cache[context.baseUrl]).toBeUndefined();

      mod.revert();
    });

    it('renders from cache and skips the fetch event when a fresh entry exists for baseUrl', async () => {
      const context = {
        version: '25.4', origin: 'https://h', instance: 'h', tenant: 'training',
        baseUrl: 'https://h/training', contextPath: '/training/',
      };
      await batchJobsCacheItem.setValue({
        [context.baseUrl]: {
          rows: [{
            id: 'persistentJob_cached',
            html: rowHtml({
              name: 'Cached Job', href: '/training/batchJob/view?id=cached',
              startedAt: Date.now() - 1000, state: 'success', duration: 1000,
            }),
          }],
          total: 1,
          error: null,
          timestamp: Date.now(),
        },
      });

      const fetchListener = vi.fn();
      document.addEventListener('cplace:fetchBatchJobs', fetchListener);

      const mod = await loadMod();
      mod.apply({}, context);

      // Let the cache lookup promise resolve
      await new Promise((r) => setTimeout(r, 0));

      expect(fetchListener).not.toHaveBeenCalled();
      const panel = document.getElementById('cplace-batch-jobs-panel');
      expect(panel).not.toBeNull();
      expect(panel.querySelector('.cplace-bj-badge')).not.toBeNull();

      document.removeEventListener('cplace:fetchBatchJobs', fetchListener);
      mod.revert();
    });

    it('falls through to the fetch event when the cache entry is stale', async () => {
      const context = {
        version: '25.4', origin: 'https://h', instance: 'h', tenant: 'training',
        baseUrl: 'https://h/training', contextPath: '/training/',
      };
      // Default pollMs = 60_000 → ttl = 55_000. Make the entry older.
      await batchJobsCacheItem.setValue({
        [context.baseUrl]: {
          rows: [], total: 0, error: null,
          timestamp: Date.now() - 120_000,
        },
      });

      const fetchListener = vi.fn();
      document.addEventListener('cplace:fetchBatchJobs', fetchListener);

      const mod = await loadMod();
      mod.apply({}, context);
      await new Promise((r) => setTimeout(r, 0));

      expect(fetchListener).toHaveBeenCalledTimes(1);
      expect(fetchListener.mock.calls[0][0].detail.baseUrl).toBe(context.baseUrl);

      document.removeEventListener('cplace:fetchBatchJobs', fetchListener);
      mod.revert();
    });

    it('uses default position when no panelPosition is stored', async () => {
      const mod = await loadMod();
      mod.apply();

      document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', {
        detail: {
          rows: [{
            id: 'persistentJob_j',
            html: rowHtml({
              name: 'J', href: '/training/batchJob/view?id=j',
              startedAt: Date.now() - 1000, state: 'running', duration: 0,
            }),
          }],
          total: 1,
        },
      }));

      const panel = document.getElementById('cplace-batch-jobs-panel');
      expect(panel.style.getPropertyValue('--cplace-bj-right')).toBe('16px');
      expect(panel.style.getPropertyValue('--cplace-bj-bottom')).toBe('16px');
      mod.revert();
    });

    it('restores a saved panelPosition on apply()', async () => {
      const mod = await loadMod();
      mod.apply({ panelPosition: { right: 200, bottom: 300 } });

      document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', {
        detail: {
          rows: [{
            id: 'persistentJob_j',
            html: rowHtml({
              name: 'J', href: '/training/batchJob/view?id=j',
              startedAt: Date.now() - 1000, state: 'running', duration: 0,
            }),
          }],
          total: 1,
        },
      }));

      const panel = document.getElementById('cplace-batch-jobs-panel');
      expect(panel.style.getPropertyValue('--cplace-bj-right')).toBe('200px');
      expect(panel.style.getPropertyValue('--cplace-bj-bottom')).toBe('300px');
      mod.revert();
    });

    it('respects a custom limitJobs option', async () => {
      const mod = await loadMod();
      mod.apply({ limitJobs: 5 });

      const rows = [];
      for (let i = 0; i < 12; i++) {
        rows.push({
          id: `persistentJob_job${i}`,
          html: rowHtml({
            name: `Job ${i}`, href: `/training/batchJob/view?id=job${i}`,
            startedAt: Date.now() - i * 1000, state: 'success', duration: 100 + i,
          }),
        });
      }

      document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', {
        detail: { rows, total: rows.length },
      }));

      const badge = document.querySelector('.cplace-bj-badge');
      expect(badge.textContent).toBe('Latest 5 Batch jobs ▾');

      badge.click();
      const items = document.querySelectorAll('.cplace-bj-list li');
      expect(items.length).toBe(5);

      mod.revert();
    });
  });

  describe('panel position (drag + persistence)', () => {
    function singleJobRows() {
      return [{
        id: 'persistentJob_j',
        html: rowHtml({
          name: 'J', href: '/training/batchJob/view?id=j',
          startedAt: Date.now() - 1000, state: 'running', duration: 0,
        }),
      }];
    }

    function dispatchResult() {
      document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', {
        detail: { rows: singleJobRows(), total: 1 },
      }));
    }

    function pointer(type, target, { clientX = 0, clientY = 0, pointerId = 1 } = {}) {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      ev.clientX = clientX;
      ev.clientY = clientY;
      ev.pointerId = pointerId;
      ev.button = 0;
      target.dispatchEvent(ev);
    }

    it('clampPosition keeps the panel at least 32px on screen', async () => {
      const { clampPosition } = await import('./index.js');
      const fakePanel = { getBoundingClientRect: () => ({ width: 100, height: 50 }) };
      const origW = window.innerWidth;
      const origH = window.innerHeight;
      Object.defineProperty(window, 'innerWidth',  { configurable: true, value: 800 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
      try {
        // Too far right (would push panel off-screen-left): clamped down
        expect(clampPosition({ right: 99999, bottom: 16 }, fakePanel).right)
          .toBe(800 - 32);
        // Negative right (panel pushed off-screen-right): clamped up so 32px remains
        expect(clampPosition({ right: -9999, bottom: 16 }, fakePanel).right)
          .toBe(32 - 100);
        expect(clampPosition({ right: 16, bottom: 99999 }, fakePanel).bottom)
          .toBe(600 - 32);
      } finally {
        Object.defineProperty(window, 'innerWidth',  { configurable: true, value: origW });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: origH });
      }
    });

    it('click on badge (no drag) still toggles expand', async () => {
      const mod = await loadMod();
      mod.apply();
      dispatchResult();
      const badge = document.querySelector('.cplace-bj-badge');
      pointer('pointerdown', badge, { clientX: 100, clientY: 100 });
      pointer('pointerup',   badge, { clientX: 100, clientY: 100 });
      badge.click();
      expect(document.querySelector('.cplace-bj-expanded-panel')).not.toBeNull();
      mod.revert();
    });

    it('drag past threshold updates position, persists, and adds reset button', async () => {
      const mod = await loadMod();
      mod.apply();
      dispatchResult();
      const badge = document.querySelector('.cplace-bj-badge');

      pointer('pointerdown', badge, { clientX: 500, clientY: 500 });
      pointer('pointermove', badge, { clientX: 400, clientY: 450 });
      pointer('pointerup',   badge, { clientX: 400, clientY: 450 });

      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));

      const stored = await moduleOptionsItem.getValue();
      expect(stored['batch-jobs']).toBeDefined();
      expect(stored['batch-jobs'].panelPosition).toBeDefined();
      // Pointer moved 100px left and 50px up → right grows by 100, bottom by 50
      expect(stored['batch-jobs'].panelPosition.right).toBe(16 + 100);
      expect(stored['batch-jobs'].panelPosition.bottom).toBe(16 + 50);

      const panel = document.getElementById('cplace-batch-jobs-panel');
      expect(panel.style.getPropertyValue('--cplace-bj-right')).toBe('116px');
      expect(panel.style.getPropertyValue('--cplace-bj-bottom')).toBe('66px');

      // Now expand and verify the reset button is shown
      document.querySelector('.cplace-bj-badge').click();
      expect(document.querySelector('.cplace-bj-reset')).not.toBeNull();

      mod.revert();
    });

    it('reset button restores default position, persists, and hides itself', async () => {
      await moduleOptionsItem.setValue({
        'batch-jobs': { panelPosition: { right: 250, bottom: 250 } },
      });
      const mod = await loadMod();
      mod.apply({ panelPosition: { right: 250, bottom: 250 } });
      dispatchResult();

      document.querySelector('.cplace-bj-badge').click();
      const resetBtn = document.querySelector('.cplace-bj-reset');
      expect(resetBtn).not.toBeNull();

      resetBtn.click();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));

      const panel = document.getElementById('cplace-batch-jobs-panel');
      expect(panel.style.getPropertyValue('--cplace-bj-right')).toBe('16px');
      expect(panel.style.getPropertyValue('--cplace-bj-bottom')).toBe('16px');
      expect(document.querySelector('.cplace-bj-reset')).toBeNull();

      const stored = await moduleOptionsItem.getValue();
      expect(stored['batch-jobs'].panelPosition).toEqual({ right: 16, bottom: 16 });

      mod.revert();
    });

    it('window resize re-clamps an off-screen position and persists the new value', async () => {
      const mod = await loadMod();
      mod.apply({ panelPosition: { right: 700, bottom: 16 } });
      dispatchResult();

      const panel = document.getElementById('cplace-batch-jobs-panel');
      // Force a small viewport
      const origW = window.innerWidth;
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 });
      try {
        window.dispatchEvent(new Event('resize'));
        await new Promise((r) => setTimeout(r, 0));
        const right = parseFloat(panel.style.getPropertyValue('--cplace-bj-right'));
        expect(right).toBeLessThanOrEqual(400 - 32);
        const stored = await moduleOptionsItem.getValue();
        expect(stored['batch-jobs'].panelPosition.right).toBeLessThanOrEqual(400 - 32);
      } finally {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: origW });
        mod.revert();
      }
    });

    it('does not persist on a non-drag click', async () => {
      const mod = await loadMod();
      mod.apply();
      dispatchResult();
      const badge = document.querySelector('.cplace-bj-badge');
      pointer('pointerdown', badge, { clientX: 50, clientY: 50 });
      pointer('pointerup',   badge, { clientX: 50, clientY: 50 });
      await new Promise((r) => setTimeout(r, 0));
      const stored = await moduleOptionsItem.getValue();
      expect(stored['batch-jobs']).toBeUndefined();
      mod.revert();
    });
  });
});
