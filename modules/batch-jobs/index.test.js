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
          tenantPath: '/training/',
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
      mod.apply();

      document.dispatchEvent(new CustomEvent('cplace:batchJobsResult', {
        detail: {
          rows: [{
            id: 'persistentJob_job1',
            html: rowHtml({
              name: 'Job One', href: '/training/batchJob/view?id=job1',
              startedAt: Date.now() - 3000, state: 'running', duration: 0,
            }),
          }],
          total: 1, tenantPath: '/training/',
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
              name: 'Finished Job', href: '/training/batchJob/view?id=done1',
              startedAt: Date.now() - 60_000, state: 'success', duration: 1500,
            }) },
            { id: 'persistentJob_run1', html: rowHtml({
              name: 'Live Job', href: '/training/batchJob/view?id=run1',
              startedAt: Date.now() - 3000, state: 'running', duration: 0,
            }) },
          ],
          total: 2, tenantPath: '/training/',
        },
      }));

      document.querySelector('.cplace-bj-badge').click();

      const items = document.querySelectorAll('.cplace-bj-list li');
      expect(items.length).toBe(2);

      expect(items[0].querySelector('.cplace-bj-status--success')).not.toBeNull();
      expect(items[0].querySelector('a').textContent).toBe('Finished Job');
      expect(items[0].querySelector('a').getAttribute('href')).toBe('/training/batchJob/view?id=done1');
      expect(items[0].querySelector('a').getAttribute('title')).toBe('Finished Job');
      expect(items[0].querySelector('.cplace-bj-workspace').textContent).toBe('training');
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

    it('caps the rendered list at 10 jobs', async () => {
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
        detail: { rows, total: rows.length, tenantPath: '/training/' },
      }));

      document.querySelector('.cplace-bj-badge').click();

      const items = document.querySelectorAll('.cplace-bj-list li');
      expect(items.length).toBe(10);

      mod.revert();
    });
  });
});
