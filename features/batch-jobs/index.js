import { batchJobsCacheItem, moduleOptionsItem } from '../storage.js';

const PANEL_ID = 'cplace-batch-jobs-panel';
const CACHE_PRUNE_MS = 60 * 60 * 1000;
const DEFAULT_POS = { right: 16, bottom: 16 };
const DRAG_THRESHOLD = 4;
const MIN_VISIBLE = 32;

let intervalId        = null;
let tickId            = null;
let expanded          = false;
let jobLimit          = 10;
let pollMs            = 60_000;
let applied           = false;
let visibilityHandler = null;
let resizeHandler     = null;
let currentContext    = null;
let panelPosition     = { ...DEFAULT_POS };
let lastJobs          = [];
let lastBaseUrl       = null;

export function clampPosition(pos, panelEl) {
  const rect = panelEl?.getBoundingClientRect?.() || { width: 0, height: 0 };
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  const width  = rect.width  || 0;
  const height = rect.height || 0;
  const maxRight  = Math.max(MIN_VISIBLE - width,  vw - MIN_VISIBLE);
  const minRight  = Math.min(MIN_VISIBLE - width,  vw - MIN_VISIBLE);
  const maxBottom = Math.max(MIN_VISIBLE - height, vh - MIN_VISIBLE);
  const minBottom = Math.min(MIN_VISIBLE - height, vh - MIN_VISIBLE);
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  return {
    right:  clamp(pos.right,  minRight,  maxRight),
    bottom: clamp(pos.bottom, minBottom, maxBottom),
  };
}

function applyPosition(panelEl) {
  if (!panelEl) return;
  panelEl.style.setProperty('--cplace-bj-right',  `${panelPosition.right}px`);
  panelEl.style.setProperty('--cplace-bj-bottom', `${panelPosition.bottom}px`);
}

function isCustomPosition() {
  return panelPosition.right !== DEFAULT_POS.right || panelPosition.bottom !== DEFAULT_POS.bottom;
}

async function persistPosition() {
  try {
    const all = (await moduleOptionsItem.getValue()) || {};
    const prev = all['batch-jobs'] || {};
    const next = { ...all, 'batch-jobs': { ...prev, panelPosition: { ...panelPosition } } };
    await moduleOptionsItem.setValue(next);
  } catch (_) { /* ignore */ }
}

function attachDragHandlers(handleEl, panelEl) {
  let startX = 0;
  let startY = 0;
  let startRight = 0;
  let startBottom = 0;
  let moved = false;
  let activePointerId = null;

  const onMove = (e) => {
    if (e.pointerId !== activePointerId) return;
    const dx = startX - e.clientX;
    const dy = startY - e.clientY;
    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    moved = true;
    panelEl.classList.add('cplace-bj-dragging');
    panelPosition = clampPosition({ right: startRight + dx, bottom: startBottom + dy }, panelEl);
    applyPosition(panelEl);
  };

  const onUp = (e) => {
    if (e.pointerId !== activePointerId) return;
    handleEl.removeEventListener('pointermove', onMove);
    handleEl.removeEventListener('pointerup', onUp);
    handleEl.removeEventListener('pointercancel', onUp);
    try { handleEl.releasePointerCapture?.(activePointerId); } catch (_) { /* ignore */ }
    activePointerId = null;
    panelEl.classList.remove('cplace-bj-dragging');
    if (moved) {
      handleEl._cplaceBjSuppressClick = true;
      persistPosition().finally(() => {
        renderPanel(lastJobs, lastBaseUrl);
      });
    }
  };

  handleEl.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest('button, a') &&
        !e.target.closest('.cplace-bj-badge')) {
      return;
    }
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startRight = panelPosition.right;
    startBottom = panelPosition.bottom;
    moved = false;
    handleEl._cplaceBjSuppressClick = false;
    try { handleEl.setPointerCapture?.(e.pointerId); } catch (_) { /* ignore */ }
    handleEl.addEventListener('pointermove', onMove);
    handleEl.addEventListener('pointerup', onUp);
    handleEl.addEventListener('pointercancel', onUp);
  });
}

function wasDragged(handleEl) {
  if (handleEl._cplaceBjSuppressClick) {
    handleEl._cplaceBjSuppressClick = false;
    return true;
  }
  return false;
}

function ttlMs() {
  return Math.max(pollMs - 5_000, Math.floor(pollMs * 0.9));
}

async function fetchRunningJobs() {
  const baseUrl = currentContext?.baseUrl ?? null;
  if (baseUrl) {
    try {
      const cache = await batchJobsCacheItem.getValue();
      const entry = cache?.[baseUrl];
      if (entry && !entry.error && Date.now() - entry.timestamp < ttlMs()) {
        renderPanel(parseRows(entry.rows).slice(0, jobLimit), baseUrl);
        return;
      }
    } catch (_) { /* fall through to live fetch */ }
  }
  document.dispatchEvent(new CustomEvent('cplace:fetchBatchJobs', {
    detail: {
      baseUrl,
      contextPath: currentContext?.contextPath ?? null,
    },
  }));
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

function renderPanel(jobs, baseUrl = null) {
  lastJobs = jobs;
  lastBaseUrl = baseUrl;

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
  applyPosition(panel);

  if (!expanded) {
    const badge = document.createElement('button');
    badge.className = 'cplace-bj-badge';
    badge.textContent = `Latest ${jobLimit} Batch jobs ▾`;
    badge.addEventListener('click', () => {
      if (wasDragged(badge)) return;
      expanded = true;
      renderPanel(jobs, baseUrl);
    });
    panel.appendChild(badge);
    attachDragHandlers(badge, panel);
  } else {
    const container = document.createElement('div');
    container.className = 'cplace-bj-expanded-panel';

    const header = document.createElement('div');
    header.className = 'cplace-bj-header';
    let title;
    if (baseUrl) {
      title = document.createElement('a');
      title.href = `${baseUrl}/batchJob/jobs`;
      title.target = '_blank';
      title.rel = 'noopener noreferrer';
    } else {
      title = document.createElement('span');
    }
    title.textContent = `Latest ${jobLimit} Batch jobs`;

    const actions = document.createElement('div');
    actions.className = 'cplace-bj-header-actions';

    if (isCustomPosition()) {
      const resetBtn = document.createElement('button');
      resetBtn.className = 'cplace-bj-reset';
      resetBtn.textContent = '↺';
      resetBtn.title = 'Reset position';
      resetBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        panelPosition = { ...DEFAULT_POS };
        persistPosition().finally(() => {
          renderPanel(jobs, baseUrl);
        });
      });
      actions.appendChild(resetBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'cplace-bj-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      expanded = false;
      renderPanel(jobs, baseUrl);
    });
    actions.appendChild(closeBtn);

    header.appendChild(title);
    header.appendChild(actions);

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
    attachDragHandlers(header, panel);
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

function writeCache(baseUrl, rows, total) {
  batchJobsCacheItem.getValue().then((cache) => {
    const next = {};
    const cutoff = Date.now() - CACHE_PRUNE_MS;
    for (const [key, entry] of Object.entries(cache || {})) {
      if (entry?.timestamp && entry.timestamp >= cutoff) next[key] = entry;
    }
    next[baseUrl] = { rows, total, error: null, timestamp: Date.now() };
    return batchJobsCacheItem.setValue(next);
  }).catch(() => {});
}

function onResult(event) {
  const { rows = [], total = 0, error } = event.detail || {};
  if (error) {
    renderError(error);
    return;
  }
  const baseUrl = currentContext?.baseUrl ?? null;
  if (baseUrl) writeCache(baseUrl, rows, total);
  renderPanel(parseRows(rows).slice(0, jobLimit), baseUrl);
}

export default {
  id: 'batch-jobs',
  name: 'Batch Jobs overlay',
  description: 'Shows a live overlay of running batch jobs on every cplace page. Polls while the tab is visible; shows a red error indicator on connection failure.',
  defaultEnabled: false,
  snoozable: true,
  css: true,
  pageScript: true,
  options: [
    { id: 'limitJobs',    label: 'Limit latest jobs',   type: 'number', default: 10 },
    { id: 'pollInterval', label: 'Poll interval (s)',    type: 'number', default: 60 },
  ],
  apply(options = {}, context = null) {
    jobLimit = typeof options.limitJobs    === 'number' ? options.limitJobs   : 10;
    pollMs   = typeof options.pollInterval === 'number' && options.pollInterval > 0
               ? options.pollInterval * 1000 : 60_000;
    const p = options.panelPosition;
    if (p && Number.isFinite(p.right) && Number.isFinite(p.bottom)) {
      panelPosition = { right: p.right, bottom: p.bottom };
    } else {
      panelPosition = { ...DEFAULT_POS };
    }
    const panelEl = document.getElementById(PANEL_ID);
    if (panelEl) applyPosition(panelEl);
    currentContext = context;
    if (applied) return;
    applied = true;
    document.addEventListener('cplace:batchJobsResult', onResult);
    visibilityHandler = () => {
      if (document.visibilityState === 'visible') startPolling();
      else stopPolling();
    };
    document.addEventListener('visibilitychange', visibilityHandler);
    resizeHandler = () => {
      const el = document.getElementById(PANEL_ID);
      if (!el) return;
      const next = clampPosition(panelPosition, el);
      if (next.right !== panelPosition.right || next.bottom !== panelPosition.bottom) {
        panelPosition = next;
        applyPosition(el);
        persistPosition();
      }
    };
    window.addEventListener('resize', resizeHandler);
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
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
    document.getElementById(PANEL_ID)?.remove();
    expanded = false;
    currentContext = null;
    panelPosition = { ...DEFAULT_POS };
    lastJobs = [];
    lastBaseUrl = null;
  },
  onVersionDetected(context) {
    currentContext = context;
  },
};
