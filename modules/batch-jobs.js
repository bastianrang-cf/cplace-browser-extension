const PANEL_ID = 'cplace-batch-jobs-panel';
const STYLE_ID = 'cplace-batch-jobs-style';
const POLL_MS  = 15_000;

const CSS = `
  #cplace-batch-jobs-panel {
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 2147483647;
    font-family: system-ui, sans-serif;
    font-size: 13px;
  }
  #cplace-batch-jobs-panel .cplace-bj-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: #1a56db;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0,0,0,.3);
  }
  #cplace-batch-jobs-panel .cplace-bj-expanded-panel {
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,.2);
    min-width: 320px;
    overflow: hidden;
  }
  #cplace-batch-jobs-panel .cplace-bj-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: #1a56db;
    color: #fff;
  }
  #cplace-batch-jobs-panel .cplace-bj-header span {
    font-weight: 600;
  }
  #cplace-batch-jobs-panel .cplace-bj-close {
    background: none;
    border: none;
    color: #fff;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 0;
  }
  #cplace-batch-jobs-panel .cplace-bj-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 300px;
    overflow-y: auto;
  }
  #cplace-batch-jobs-panel .cplace-bj-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    border-bottom: 1px solid #f3f4f6;
  }
  #cplace-batch-jobs-panel .cplace-bj-list li:last-child {
    border-bottom: none;
  }
  #cplace-batch-jobs-panel .cplace-bj-list a {
    color: #1a56db;
    text-decoration: none;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  #cplace-batch-jobs-panel .cplace-bj-list a:hover {
    text-decoration: underline;
  }
  #cplace-batch-jobs-panel .cplace-bj-elapsed {
    color: #6b7280;
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    margin-left: 8px;
    flex-shrink: 0;
  }
`;

let intervalId = null;
let tickId     = null;
let expanded   = false;

function injectPageScript() {
  if (document.querySelector('script[data-cplace-batch-jobs]')) return;
  const script = document.createElement('script');
  script.src = browser.runtime.getURL('batch-jobs-page.js');
  script.dataset.cplaceBatchJobs = '1';
  (document.head || document.documentElement).appendChild(script);
}

function fetchRunningJobs() {
  document.dispatchEvent(new CustomEvent('cplace:fetchBatchJobs'));
}

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateElapsedCounters() {
  const now = Date.now();
  document.querySelectorAll(`#${PANEL_ID} [data-started-at]`).forEach((el) => {
    const startedAt = parseInt(el.dataset.startedAt, 10);
    if (!isNaN(startedAt)) el.textContent = formatElapsed(now - startedAt);
  });
}

function parseRows(rows, tenantPath) {
  const jobs = [];
  for (const row of rows) {
    try {
      const doc = new DOMParser().parseFromString(row.html, 'text/html');
      const tds = doc.querySelectorAll('td[cplace-control]');
      let name = '';
      let startedAt = null;
      for (const td of tds) {
        try {
          const ctrl = JSON.parse(td.getAttribute('cplace-control'));
          if (ctrl.name !== undefined) name = ctrl.name;
          if (ctrl.startedAt !== undefined) startedAt = ctrl.startedAt;
        } catch (_) { /* skip malformed td */ }
      }
      const jobId = row.id.replace('persistentJob_', '');
      const linkUrl = window.location.origin + tenantPath + 'batchJob/' + jobId;
      jobs.push({ id: row.id, name: name || row.id, startedAt, linkUrl });
    } catch (_) { /* skip malformed row */ }
  }
  return jobs;
}

function renderPanel(jobs) {
  if (jobs.length === 0) {
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    return;
  }

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  let panel = document.getElementById(PANEL_ID);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    document.body.appendChild(panel);
  }

  panel.innerHTML = '';

  if (!expanded) {
    const badge = document.createElement('button');
    badge.className = 'cplace-bj-badge';
    badge.textContent = `Running Batch Jobs (${jobs.length}) ▾`;
    badge.addEventListener('click', () => {
      expanded = true;
      renderPanel(jobs);
    });
    panel.appendChild(badge);
  } else {
    const container = document.createElement('div');
    container.className = 'cplace-bj-expanded-panel';

    const header = document.createElement('div');
    header.className = 'cplace-bj-header';
    const title = document.createElement('span');
    title.textContent = `Running Batch Jobs (${jobs.length})`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'cplace-bj-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => {
      expanded = false;
      renderPanel(jobs);
    });
    header.appendChild(title);
    header.appendChild(closeBtn);

    const list = document.createElement('ul');
    list.className = 'cplace-bj-list';
    const now = Date.now();
    for (const job of jobs) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = job.linkUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = job.name;
      const elapsed = document.createElement('span');
      elapsed.className = 'cplace-bj-elapsed';
      elapsed.dataset.startedAt = job.startedAt ?? '';
      elapsed.textContent = job.startedAt ? formatElapsed(now - job.startedAt) : '—';
      li.appendChild(a);
      li.appendChild(elapsed);
      list.appendChild(li);
    }

    container.appendChild(header);
    container.appendChild(list);
    panel.appendChild(container);
  }
}

function onResult(event) {
  const { rows = [], tenantPath = '' } = event.detail || {};
  const jobs = parseRows(rows, tenantPath);
  renderPanel(jobs);
}

let tickFn = null;

export default {
  id: 'batch-jobs',
  name: 'Batch Jobs overlay',
  description: 'Shows a live overlay of running batch jobs on every cplace page. Polls every 15 s while the tab is visible.',
  defaultEnabled: false,
  apply() {
    if (intervalId) return;
    injectPageScript();
    document.addEventListener('cplace:batchJobsResult', onResult);
    tickFn = () => {
      if (document.visibilityState === 'visible') fetchRunningJobs();
    };
    tickFn();
    intervalId = setInterval(tickFn, POLL_MS);
    document.addEventListener('visibilitychange', tickFn);
    tickId = setInterval(updateElapsedCounters, 1_000);
  },
  revert() {
    clearInterval(intervalId);
    clearInterval(tickId);
    intervalId = null;
    tickId = null;
    document.removeEventListener('cplace:batchJobsResult', onResult);
    if (tickFn) {
      document.removeEventListener('visibilitychange', tickFn);
      tickFn = null;
    }
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    expanded = false;
  },
};
