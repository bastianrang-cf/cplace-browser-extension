const PANEL_ID = 'cplace-batch-jobs-panel';

let intervalId        = null;
let tickId            = null;
let expanded          = false;
let jobLimit          = 10;
let pollMs            = 60_000;
let applied           = false;
let visibilityHandler = null;

function fetchRunningJobs() {
  document.dispatchEvent(new CustomEvent('cplace:fetchBatchJobs'));
}

function startPolling() {
  if (intervalId) return;
  fetchRunningJobs();
  intervalId = setInterval(fetchRunningJobs, pollMs);
}

function stopPolling() {
  clearInterval(intervalId);
  intervalId = null;
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

const STATUS_ICON = {
  success:          { ch: '✓', cls: 'cplace-bj-status--success' },
  error:            { ch: '✗', cls: 'cplace-bj-status--error' },
  errorInMigration: { ch: '✗', cls: 'cplace-bj-status--error' },
  running:          { ch: '⟳', cls: 'cplace-bj-status--running' },
  cancelled:        { ch: '⊘', cls: 'cplace-bj-status--cancelled' },
  waitForCancel:    { ch: '⊘', cls: 'cplace-bj-status--cancelled' },
  skipped:          { ch: '–', cls: 'cplace-bj-status--skipped' },
  created:          { ch: '○', cls: 'cplace-bj-status--created' },
};

function formatDuration(ms) {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function parseRows(rows) {
  const jobs = [];
  for (const row of rows) {
    try {
      const doc = new DOMParser().parseFromString(`<table>${row.html}</table>`, 'text/html');
      const wrappers = doc.querySelectorAll('[cplace-control]');
      let name = '';
      let linkHref = '';
      let startedAt = null;
      let status = null;
      let durationMs = null;
      for (const w of wrappers) {
        let ctrl;
        try { ctrl = JSON.parse(w.getAttribute('cplace-control')); } catch { continue; }
        switch (ctrl.name) {
          case 'name': {
            name = typeof ctrl.value === 'string' ? ctrl.value : '';
            const a = w.querySelector('a.assetLink') || w.querySelector('a[href]');
            if (a) linkHref = a.getAttribute('href') || '';
            break;
          }
          case 'startedAt': {
            const ts = w.querySelector('cplace-timestamp');
            const raw = ts && ts.getAttribute('timestamp');
            const n = raw ? parseInt(raw, 10) : NaN;
            startedAt = Number.isNaN(n) ? null : n;
            break;
          }
          case 'state': {
            const el = w.querySelector('[data-status]');
            status = el ? el.getAttribute('data-status') : (typeof ctrl.value === 'string' ? ctrl.value : null);
            break;
          }
          case 'duration': {
            const n = parseInt(ctrl.value, 10);
            durationMs = Number.isNaN(n) ? null : n;
            break;
          }
        }
      }
      const id = (row.id || '').replace(/^persistentJob_/, '');
      const workspaceMatch = name.match(/\(Workspace "([^"]+)"\)/);
      const workspace = workspaceMatch ? workspaceMatch[1] : '';
      jobs.push({ id, name: name || id, linkHref, startedAt, status, durationMs, workspace });
    } catch { /* skip malformed row */ }
  }
  return jobs;
}

function renderPanel(jobs, tenantPath = '') {
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
    badge.textContent = `Latest ${jobLimit} Batch jobs ▾`;
    badge.addEventListener('click', () => {
      expanded = true;
      renderPanel(jobs, tenantPath);
    });
    panel.appendChild(badge);
  } else {
    const container = document.createElement('div');
    container.className = 'cplace-bj-expanded-panel';

    const header = document.createElement('div');
    header.className = 'cplace-bj-header';
    let title;
    if (tenantPath) {
      title = document.createElement('a');
      title.href = window.location.origin + tenantPath + 'batchJob/jobs';
      title.target = '_blank';
      title.rel = 'noopener noreferrer';
    } else {
      title = document.createElement('span');
    }
    title.textContent = `Latest ${jobLimit} Batch jobs`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'cplace-bj-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => {
      expanded = false;
      renderPanel(jobs, tenantPath);
    });
    header.appendChild(title);
    header.appendChild(closeBtn);

    const list = document.createElement('ul');
    list.className = 'cplace-bj-list';
    const now = Date.now();
    for (const job of jobs) {
      const li = document.createElement('li');

      const icon = document.createElement('span');
      const s = STATUS_ICON[job.status] || STATUS_ICON.created;
      icon.className = `cplace-bj-status ${s.cls}`;
      icon.textContent = s.ch;

      const jobInfo = document.createElement('div');
      jobInfo.className = 'cplace-bj-job-info';

      const a = document.createElement('a');
      a.href = job.linkHref || '#';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = job.name;
      a.title = job.name;

      const workspaceEl = document.createElement('small');
      workspaceEl.className = 'cplace-bj-workspace';
      workspaceEl.textContent = job.workspace;

      jobInfo.appendChild(a);
      jobInfo.appendChild(workspaceEl);

      const timing = document.createElement('div');
      timing.className = 'cplace-bj-timing';

      const startedAtEl = document.createElement('span');
      startedAtEl.className = 'cplace-bj-started-at';
      startedAtEl.textContent = formatTime(job.startedAt);

      const metric = document.createElement('span');
      metric.className = 'cplace-bj-elapsed';
      if (job.status === 'running' && job.startedAt) {
        metric.dataset.startedAt = String(job.startedAt);
        metric.textContent = formatElapsed(now - job.startedAt);
      } else if (job.durationMs != null) {
        metric.textContent = formatDuration(job.durationMs);
      } else {
        metric.textContent = '—';
      }

      timing.appendChild(startedAtEl);
      timing.appendChild(metric);

      li.appendChild(icon);
      li.appendChild(jobInfo);
      li.appendChild(timing);
      list.appendChild(li);
    }

    container.appendChild(header);
    container.appendChild(list);
    panel.appendChild(container);
  }
}

function renderError(msg) {
  let panel = document.getElementById(PANEL_ID);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    document.body.appendChild(panel);
  }
  panel.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'cplace-bj-error';
  el.textContent = '⚠ ' + msg;
  panel.appendChild(el);
}

function onResult(event) {
  const { rows = [], tenantPath = '', error } = event.detail || {};
  if (error) {
    renderError(error);
    return;
  }
  renderPanel(parseRows(rows).slice(0, jobLimit), tenantPath);
}

export default {
  id: 'batch-jobs',
  name: 'Batch Jobs overlay',
  description: 'Shows a live overlay of running batch jobs on every cplace page. Polls while the tab is visible; shows a red error indicator on connection failure.',
  defaultEnabled: false,
  css: true,
  pageScript: true,
  options: [
    { id: 'limitJobs',    label: 'Limit latest jobs',   type: 'number', default: 10 },
    { id: 'pollInterval', label: 'Poll interval (s)',    type: 'number', default: 60 },
  ],
  apply(options = {}) {
    jobLimit = typeof options.limitJobs    === 'number' ? options.limitJobs   : 10;
    pollMs   = typeof options.pollInterval === 'number' && options.pollInterval > 0
               ? options.pollInterval * 1000 : 60_000;
    if (applied) return;
    applied = true;
    document.addEventListener('cplace:batchJobsResult', onResult);
    visibilityHandler = () => {
      if (document.visibilityState === 'visible') startPolling();
      else stopPolling();
    };
    document.addEventListener('visibilitychange', visibilityHandler);
    if (document.visibilityState === 'visible') startPolling();
    tickId = setInterval(updateElapsedCounters, 1_000);
  },
  revert() {
    stopPolling();
    clearInterval(tickId);
    tickId = null;
    applied = false;
    document.removeEventListener('cplace:batchJobsResult', onResult);
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
    document.getElementById(PANEL_ID)?.remove();
    expanded = false;
  },
};
