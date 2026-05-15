const PANEL_ID = 'cplace-batch-jobs-panel';
const POLL_MS  = 15_000;

let intervalId = null;
let tickId     = null;
let expanded   = false;

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
    return;
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
  css: true,
  pageScript: true,
  apply() {
    if (intervalId) return;
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
    expanded = false;
  },
};
