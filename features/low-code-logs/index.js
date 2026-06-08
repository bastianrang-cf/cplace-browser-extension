import {
  lowCodeLogsCacheItem,
  lowCodeLogsSeenItem,
  lowCodeLogsFiltersItem,
  moduleOptionsItem,
} from '../storage.js';

const STACK_ID = 'cplace-low-code-logs-stack';
const CACHE_PRUNE_MS = 60 * 60 * 1000;
const SEEN_PRUNE_MS = 24 * 60 * 60 * 1000;
const SEEN_MAX_IDS = 5000;
const DEFAULT_POS = { top: 16, right: 16 };
const DRAG_THRESHOLD = 4;
const MIN_VISIBLE = 32;
const PAGE_SIZE = 25;
const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVEL_ICONS = { debug: '·', info: 'ℹ', warn: '⚠', error: '✕' };
const FILTERABLE_FIELDS = ['scriptType', 'scriptId', 'entity', 'spaceId', 'user', 'requestUrl'];

let intervalId        = null;
let applied           = false;
let visibilityHandler = null;
let resizeHandler     = null;
let filterWatcher     = null;
let pageReadyHandler  = null;
let pageReady         = false;
let pollMs            = 15_000;
let maxToasts        = 3;
let autoDismissMs    = 8000;
let minLevel         = 'info';
let stickyOnError    = true;
let currentContext   = null;
let stackPosition    = { ...DEFAULT_POS };
let activeToasts     = []; // [{ id, el, timer, level, entry }]
let overflowQueue    = []; // entries that didn't fit, in arrival order

// FNV-1a 32-bit hash, hex string. Stable across processes/realms.
export function fnv1aHex(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const MSG_PARSE_RE = /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,3})?)\s+(\w+)\s+([\s\S]*)$/;

export function parseLogEntry(raw) {
  const msg = typeof raw?.msg === 'string' ? raw.msg : '';
  const type = String(raw?.type || 'info').toLowerCase();
  const info = raw?.additionalInfo || {};
  let timestamp = '';
  let message = msg;
  const m = MSG_PARSE_RE.exec(msg);
  if (m) {
    timestamp = m[1];
    message = m[3];
  }
  const id = fnv1aHex([
    timestamp,
    type,
    info.scriptId ?? '',
    info.entity ?? '',
    info.user ?? '',
    msg,
  ].join('|'));
  return {
    id,
    timestamp,
    type,
    message,
    raw: msg,
    additionalInfo: info,
    stackTrace: raw?.stackTrace ?? null,
  };
}

export function passesFilters(entry, filters) {
  const info = entry.additionalInfo ?? {};
  for (const [field, rule] of Object.entries(filters ?? {})) {
    if (!rule) continue;
    const include = rule.include || [];
    const exclude = rule.exclude || [];
    const value = info[field];
    if (value !== undefined && exclude.includes(value)) return false;
    if (include.length > 0 && !include.includes(value)) return false;
  }
  return true;
}

function countFilters(filterMap) {
  let count = 0;
  for (const rule of Object.values(filterMap || {})) {
    count += (rule?.include?.length || 0) + (rule?.exclude?.length || 0);
  }
  return count;
}

export function clampPosition(pos, stackEl) {
  const rect = stackEl?.getBoundingClientRect?.() || { width: 0, height: 0 };
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  const width = rect.width || 0;
  const height = rect.height || 0;
  const maxRight = Math.max(MIN_VISIBLE - width, vw - MIN_VISIBLE);
  const minRight = Math.min(MIN_VISIBLE - width, vw - MIN_VISIBLE);
  const maxTop = Math.max(0, vh - MIN_VISIBLE - height);
  const minTop = 0;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  return {
    top: clamp(pos.top, minTop, maxTop),
    right: clamp(pos.right, minRight, maxRight),
  };
}

function applyPosition(stackEl) {
  if (!stackEl) return;
  stackEl.style.setProperty('--cplace-lcl-top', `${stackPosition.top}px`);
  stackEl.style.setProperty('--cplace-lcl-right', `${stackPosition.right}px`);
}

async function persistPosition() {
  try {
    const all = (await moduleOptionsItem.getValue()) || {};
    const prev = all['low-code-logs'] || {};
    const next = { ...all, 'low-code-logs': { ...prev, panelPosition: { ...stackPosition } } };
    await moduleOptionsItem.setValue(next);
  } catch (_) { /* ignore */ }
}

function ensureStack() {
  let el = document.getElementById(STACK_ID);
  if (el) return el;
  el = document.createElement('div');
  el.id = STACK_ID;
  document.body.appendChild(el);
  applyPosition(el);
  attachDragHandlers(el);
  return el;
}

function attachDragHandlers(stackEl) {
  let startX = 0;
  let startY = 0;
  let startTop = 0;
  let startRight = 0;
  let moved = false;
  let activePointerId = null;
  let handleEl = null;

  const onMove = (e) => {
    if (e.pointerId !== activePointerId) return;
    const dx = startX - e.clientX;
    const dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    moved = true;
    stackEl.classList.add('cplace-lcl-dragging');
    stackPosition = clampPosition({ top: startTop + dy, right: startRight + dx }, stackEl);
    applyPosition(stackEl);
  };

  const onUp = (e) => {
    if (e.pointerId !== activePointerId) return;
    if (handleEl) {
      handleEl.removeEventListener('pointermove', onMove);
      handleEl.removeEventListener('pointerup', onUp);
      handleEl.removeEventListener('pointercancel', onUp);
      try { handleEl.releasePointerCapture?.(activePointerId); } catch (_) { /* ignore */ }
    }
    activePointerId = null;
    stackEl.classList.remove('cplace-lcl-dragging');
    if (moved) persistPosition();
    handleEl = null;
  };

  stackEl.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const header = e.target?.closest?.('.cplace-lcl-toast-header');
    if (!header || header.querySelector('button')?.contains(e.target)) return;
    if (e.target?.closest?.('button, a')) return;
    handleEl = header;
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startTop = stackPosition.top;
    startRight = stackPosition.right;
    moved = false;
    try { handleEl.setPointerCapture?.(e.pointerId); } catch (_) { /* ignore */ }
    handleEl.addEventListener('pointermove', onMove);
    handleEl.addEventListener('pointerup', onUp);
    handleEl.addEventListener('pointercancel', onUp);
  });
}

function ttlMs() {
  return Math.max(pollMs - 5_000, Math.floor(pollMs * 0.9));
}

function fetchLogs() {
  const baseUrl = currentContext?.baseUrl ?? null;
  if (baseUrl) {
    lowCodeLogsCacheItem.getValue().then((cache) => {
      const entry = cache?.[baseUrl];
      if (entry && !entry.error && Date.now() - entry.timestamp < ttlMs()) {
        applyLogs(entry.logs, entry.total, baseUrl, /*fromCache*/ true);
      } else {
        dispatchFetch(baseUrl);
      }
    }).catch(() => dispatchFetch(baseUrl));
  } else {
    dispatchFetch(null);
  }
}

function dispatchFetch(baseUrl) {
  document.dispatchEvent(new CustomEvent('cplace:fetchLowCodeLogs', {
    detail: { baseUrl, pageSize: PAGE_SIZE },
  }));
}

// Start the eager fetch + interval, but only once everything needed for a
// successful request is in place: the page-world script has announced it is
// listening (pageReady), a tenant context is known (baseUrl), and the tab is
// visible. The interval is anchored to this first real fetch, so on load new
// log entries surface immediately instead of after one poll interval. Idempotent.
function maybeStartPolling() {
  if (intervalId) return;
  if (document.visibilityState !== 'visible') return;
  if (!pageReady) return;
  if (!currentContext?.baseUrl) return;
  fetchLogs();
  intervalId = setInterval(fetchLogs, pollMs);
}

function stopPolling() {
  clearInterval(intervalId);
  intervalId = null;
}

async function readSeen(baseUrl) {
  try {
    const all = await lowCodeLogsSeenItem.getValue();
    return all?.[baseUrl] ?? null;
  } catch (_) {
    return null;
  }
}

async function writeSeen(baseUrl, ids) {
  try {
    const all = (await lowCodeLogsSeenItem.getValue()) || {};
    const cutoff = Date.now() - SEEN_PRUNE_MS;
    const next = {};
    for (const [key, entry] of Object.entries(all)) {
      if (entry?.updatedAt && entry.updatedAt >= cutoff && key !== baseUrl) next[key] = entry;
    }
    const capped = ids.slice(-SEEN_MAX_IDS);
    next[baseUrl] = { ids: capped, updatedAt: Date.now() };
    await lowCodeLogsSeenItem.setValue(next);
  } catch (_) { /* ignore */ }
}

async function writeCache(baseUrl, logs, total) {
  try {
    const cache = (await lowCodeLogsCacheItem.getValue()) || {};
    const next = {};
    const cutoff = Date.now() - CACHE_PRUNE_MS;
    for (const [key, entry] of Object.entries(cache)) {
      if (entry?.timestamp && entry.timestamp >= cutoff) next[key] = entry;
    }
    next[baseUrl] = { logs, total, error: null, timestamp: Date.now() };
    await lowCodeLogsCacheItem.setValue(next);
  } catch (_) { /* ignore */ }
}

async function readFilters(baseUrl) {
  try {
    const all = await lowCodeLogsFiltersItem.getValue();
    return all?.[baseUrl] ?? {};
  } catch (_) {
    return {};
  }
}

async function addFilterValue(field, value, kind /* 'include' | 'exclude' */) {
  if (!currentContext?.baseUrl || value === undefined || value === null) return;
  const baseUrl = currentContext.baseUrl;
  const all = (await lowCodeLogsFiltersItem.getValue()) || {};
  const tenant = { ...(all[baseUrl] || {}) };
  const rule = { include: [], exclude: [], ...(tenant[field] || {}) };
  const list = rule[kind] || [];
  if (!list.includes(value)) list.push(value);
  rule[kind] = list;
  tenant[field] = rule;
  all[baseUrl] = tenant;
  await lowCodeLogsFiltersItem.setValue(all);
}

async function applyLogs(logs, total, baseUrl, fromCache) {
  const parsed = (logs || []).map(parseLogEntry);
  const seenRec = await readSeen(baseUrl);
  const filters = await readFilters(baseUrl);

  if (!seenRec) {
    await writeSeen(baseUrl, parsed.map((e) => e.id));
    if (!fromCache) await writeCache(baseUrl, logs || [], total || 0);
    return;
  }

  const seenSet = new Set(seenRec.ids || []);
  const minIdx = LEVEL_ORDER[minLevel] ?? 1;

  const newEntries = [];
  for (const entry of parsed) {
    if (seenSet.has(entry.id)) continue;
    seenSet.add(entry.id);
    const levelIdx = LEVEL_ORDER[entry.type] ?? 1;
    if (levelIdx < minIdx) continue;
    if (!passesFilters(entry, filters)) continue;
    newEntries.push(entry);
  }

  if (parsed.length > 0) {
    await writeSeen(baseUrl, Array.from(seenSet));
  }
  if (!fromCache) {
    await writeCache(baseUrl, logs || [], total || 0);
  }

  for (const entry of newEntries) {
    showToast(entry, baseUrl);
  }
}

function showToast(entry, baseUrl) {
  if (activeToasts.length >= maxToasts) {
    overflowQueue.push(entry);
    renderOverflowPill(baseUrl);
    return;
  }
  const stack = ensureStack();
  const toastEl = buildToast(entry);
  stack.appendChild(toastEl);
  const timer = startDismissTimer(entry, toastEl);
  activeToasts.push({ id: entry.id, el: toastEl, timer, level: entry.level, entry });
}

function startDismissTimer(entry, toastEl) {
  const sticky = (entry.type === 'error' && stickyOnError) || autoDismissMs === 0;
  if (sticky) return null;
  const ms = entry.type === 'warn' ? Math.max(autoDismissMs, 15000) : autoDismissMs;
  const state = { remaining: ms, startedAt: Date.now(), id: null };
  const start = () => {
    state.startedAt = Date.now();
    state.id = setTimeout(() => dismissToast(entry.id), state.remaining);
  };
  const pause = () => {
    if (state.id != null) clearTimeout(state.id);
    state.remaining = Math.max(0, state.remaining - (Date.now() - state.startedAt));
    state.id = null;
  };
  toastEl.addEventListener('pointerenter', pause);
  toastEl.addEventListener('pointerleave', start);
  start();
  return state;
}

function dismissToast(id) {
  const idx = activeToasts.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const t = activeToasts[idx];
  if (t.timer?.id != null) clearTimeout(t.timer.id);
  t.el.remove();
  activeToasts.splice(idx, 1);
  drainOverflow();
}

function drainOverflow() {
  while (activeToasts.length < maxToasts && overflowQueue.length > 0) {
    const entry = overflowQueue.shift();
    showToast(entry, currentContext?.baseUrl ?? null);
  }
  renderOverflowPill(currentContext?.baseUrl ?? null);
}

function renderOverflowPill(baseUrl) {
  const stack = document.getElementById(STACK_ID);
  if (!stack) return;
  const existing = stack.querySelector('.cplace-lcl-overflow');
  if (overflowQueue.length === 0) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.textContent = `+${overflowQueue.length} more`;
    return;
  }
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'cplace-lcl-overflow';
  pill.textContent = `+${overflowQueue.length} more`;
  pill.addEventListener('click', () => openOverflowPanel());
  stack.appendChild(pill);
}

function openOverflowPanel() {
  const stack = document.getElementById(STACK_ID);
  if (!stack) return;
  let panel = stack.querySelector('.cplace-lcl-overflow-panel');
  if (panel) { panel.remove(); return; }
  panel = document.createElement('div');
  panel.className = 'cplace-lcl-overflow-panel';
  for (const entry of overflowQueue) {
    panel.appendChild(buildToast(entry, /*compact*/ true));
  }
  stack.appendChild(panel);
}

function buildToast(entry, compact = false) {
  const toast = document.createElement('div');
  toast.className = `cplace-lcl-toast cplace-lcl-toast--${entry.type}`;
  toast.dataset.id = entry.id;

  const header = document.createElement('div');
  header.className = 'cplace-lcl-toast-header';

  const level = document.createElement('span');
  level.className = 'cplace-lcl-level';
  level.textContent = LEVEL_ICONS[entry.type] || '·';
  header.appendChild(level);

  const ts = document.createElement('span');
  ts.className = 'cplace-lcl-timestamp';
  ts.textContent = entry.timestamp || entry.type.toUpperCase();
  ts.title = entry.timestamp || '';
  header.appendChild(ts);

  const filterBtn = document.createElement('button');
  filterBtn.type = 'button';
  filterBtn.className = 'cplace-lcl-filter-btn';
  filterBtn.title = 'Filter from this entry';
  filterBtn.textContent = '⋮';
  filterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFilterPopover(toast, entry);
  });
  header.appendChild(filterBtn);

  if (!compact) {
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'cplace-lcl-close-btn';
    closeBtn.title = 'Dismiss';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissToast(entry.id);
    });
    header.appendChild(closeBtn);
  }

  toast.appendChild(header);

  const msg = document.createElement('div');
  msg.className = 'cplace-lcl-message cplace-lcl-message--collapsed';
  msg.textContent = entry.message || entry.raw;
  msg.title = entry.message || entry.raw;
  msg.addEventListener('click', () => msg.classList.toggle('cplace-lcl-message--collapsed'));
  toast.appendChild(msg);

  if (entry.type === 'error' && entry.stackTrace) {
    const details = document.createElement('details');
    details.className = 'cplace-lcl-stack';
    const summary = document.createElement('summary');
    summary.textContent = 'Show stack';
    const pre = document.createElement('pre');
    pre.textContent = entry.stackTrace;
    details.appendChild(summary);
    details.appendChild(pre);
    toast.appendChild(details);
  }

  return toast;
}

export function buildValueElement(field, value, baseUrl) {
  const str = String(value);
  let href = null;
  if (field === 'spaceId' && baseUrl) {
    href = `${baseUrl}/space/details?id=${encodeURIComponent(str)}`;
  } else if (field === 'user' && baseUrl) {
    href = `${baseUrl}/persons/${encodeURIComponent(str)}`;
  } else if (field === 'requestUrl' && /^https?:\/\//.test(str)) {
    href = str;
  }
  let el;
  if (href) {
    el = document.createElement('a');
    el.href = href;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
    el.addEventListener('click', (e) => e.stopPropagation());
  } else {
    el = document.createElement('span');
  }
  el.className = 'cplace-lcl-filter-value';
  el.textContent = str;
  el.title = str;
  return el;
}

function toggleFilterPopover(toastEl, entry) {
  const existing = toastEl.querySelector('.cplace-lcl-filter-popover');
  if (existing) { existing.remove(); return; }
  const popover = document.createElement('div');
  popover.className = 'cplace-lcl-filter-popover';
  const baseUrl = currentContext?.baseUrl ?? null;

  const info = entry.additionalInfo || {};
  let hasFields = false;
  for (const field of FILTERABLE_FIELDS) {
    const value = info[field];
    if (value === undefined || value === null || value === '') continue;
    hasFields = true;
    const row = document.createElement('div');
    row.className = 'cplace-lcl-filter-row';

    const f = document.createElement('span');
    f.className = 'cplace-lcl-filter-field';
    f.textContent = `${field}:`;
    row.appendChild(f);

    row.appendChild(buildValueElement(field, value, baseUrl));

    const onlyBtn = document.createElement('button');
    onlyBtn.type = 'button';
    onlyBtn.className = 'cplace-lcl-filter-action';
    onlyBtn.textContent = '🎯';
    onlyBtn.title = 'Show only entries with this value';
    onlyBtn.setAttribute('aria-label', 'Show only entries with this value');
    onlyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await addFilterValue(field, value, 'include');
      dismissToast(entry.id);
    });
    row.appendChild(onlyBtn);

    const hideBtn = document.createElement('button');
    hideBtn.type = 'button';
    hideBtn.className = 'cplace-lcl-filter-action';
    hideBtn.textContent = '🚫';
    hideBtn.title = 'Hide entries with this value';
    hideBtn.setAttribute('aria-label', 'Hide entries with this value');
    hideBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await addFilterValue(field, value, 'exclude');
      dismissToast(entry.id);
    });
    row.appendChild(hideBtn);

    popover.appendChild(row);
  }
  if (!hasFields) {
    const empty = document.createElement('div');
    empty.className = 'cplace-lcl-filter-row';
    empty.textContent = 'No filterable fields on this entry.';
    popover.appendChild(empty);
  }
  toastEl.style.position = 'relative';
  toastEl.appendChild(popover);
}

function reevaluateActiveQueueAgainstFilters(filterMap) {
  const baseUrl = currentContext?.baseUrl ?? null;
  const filters = (filterMap || {})[baseUrl] || {};
  for (const t of [...activeToasts]) {
    if (!passesFilters(t.entry, filters)) dismissToast(t.id);
  }
  overflowQueue = overflowQueue.filter((e) => passesFilters(e, filters));
  renderOverflowPill(baseUrl);
}

function renderError(msg) {
  const stack = ensureStack();
  let err = stack.querySelector('.cplace-lcl-error');
  if (!err) {
    err = document.createElement('div');
    err.className = 'cplace-lcl-error';
    stack.insertBefore(err, stack.firstChild);
  }
  err.textContent = '⚠ Low-code logs: ' + msg;
}

function clearError() {
  document.querySelector(`#${STACK_ID} .cplace-lcl-error`)?.remove();
}

function onResult(event) {
  const { logs = [], total = 0, error } = event.detail || {};
  if (error) {
    renderError(error);
    return;
  }
  clearError();
  const baseUrl = currentContext?.baseUrl ?? null;
  if (!baseUrl) return;
  applyLogs(logs, total, baseUrl, /*fromCache*/ false);
}

function clearStack() {
  document.getElementById(STACK_ID)?.remove();
  for (const t of activeToasts) {
    if (t.timer?.id != null) clearTimeout(t.timer.id);
  }
  activeToasts = [];
  overflowQueue = [];
}

async function renderOptionsImpl(container, ctx) {
  const opts = ctx.getOptions();
  const defaults = ctx.getDefaults();

  const simpleSpec = [
    { id: 'pollIntervalSec', label: 'Poll interval (s)', type: 'number' },
    { id: 'maxToasts', label: 'Max simultaneous toasts', type: 'number' },
    { id: 'autoDismissMs', label: 'Auto-dismiss (ms, 0 = sticky)', type: 'number' },
    { id: 'minLevel', label: 'Minimum level', type: 'select', choices: ['debug', 'info', 'warn', 'error'] },
    { id: 'stickyOnError', label: 'Sticky on error', type: 'boolean' },
  ];

  for (const spec of simpleSpec) {
    const row = document.createElement('label');
    row.className = 'module-option-row';
    const label = document.createElement('span');
    label.textContent = spec.label;
    row.appendChild(label);
    let input;
    if (spec.type === 'select') {
      input = document.createElement('select');
      for (const choice of spec.choices) {
        const o = document.createElement('option');
        o.value = choice;
        o.textContent = choice;
        input.appendChild(o);
      }
      input.value = opts[spec.id] ?? defaults[spec.id] ?? spec.choices[0];
    } else if (spec.type === 'boolean') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!(opts[spec.id] ?? defaults[spec.id]);
    } else {
      input = document.createElement('input');
      input.type = 'number';
      input.value = opts[spec.id] ?? defaults[spec.id] ?? '';
    }
    input.addEventListener('change', async () => {
      const current = ctx.getOptions();
      let value;
      if (spec.type === 'number') value = Number(input.value);
      else if (spec.type === 'boolean') value = input.checked;
      else value = input.value;
      await ctx.setOptions({ ...current, [spec.id]: value });
    });
    row.appendChild(input);
    container.appendChild(row);
  }

  const filtersBox = document.createElement('div');
  filtersBox.className = 'cplace-lcl-options';
  container.appendChild(filtersBox);

  const heading = document.createElement('h3');
  heading.style.fontSize = '14px';
  heading.style.marginTop = '16px';
  heading.textContent = 'Active filters';
  filtersBox.appendChild(heading);

  await refreshFiltersTable(filtersBox);

  lowCodeLogsFiltersItem.watch(async () => {
    await refreshFiltersTable(filtersBox);
  });
}

async function refreshFiltersTable(container) {
  const old = container.querySelector('table, .cplace-lcl-no-filters, .cplace-lcl-tenant');
  while (container.children.length > 1) container.removeChild(container.lastChild);

  const map = (await lowCodeLogsFiltersItem.getValue()) || {};
  const tenants = Object.keys(map).filter((k) => countFilters(map[k]) > 0).sort();
  if (tenants.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'cplace-lcl-no-filters';
    empty.textContent = 'No filters active.';
    container.appendChild(empty);
    return;
  }
  for (const baseUrl of tenants) {
    const heading = document.createElement('div');
    heading.className = 'cplace-lcl-tenant';
    heading.textContent = baseUrl;
    container.appendChild(heading);

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Field</th><th>Kind</th><th>Value</th><th></th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const [field, rule] of Object.entries(map[baseUrl] || {})) {
      for (const kind of ['include', 'exclude']) {
        for (const value of rule?.[kind] || []) {
          const tr = document.createElement('tr');
          const tdF = document.createElement('td'); tdF.textContent = field;
          const tdK = document.createElement('td'); tdK.textContent = kind;
          const tdV = document.createElement('td'); tdV.textContent = value;
          const tdR = document.createElement('td');
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'cplace-lcl-remove';
          btn.textContent = 'Remove';
          btn.addEventListener('click', async () => {
            const all = (await lowCodeLogsFiltersItem.getValue()) || {};
            const tenant = all[baseUrl] || {};
            const r = tenant[field];
            if (r?.[kind]) r[kind] = r[kind].filter((v) => v !== value);
            if (r && !(r.include?.length) && !(r.exclude?.length)) delete tenant[field];
            else tenant[field] = r;
            if (Object.keys(tenant).length === 0) delete all[baseUrl];
            else all[baseUrl] = tenant;
            await lowCodeLogsFiltersItem.setValue(all);
          });
          tdR.appendChild(btn);
          tr.appendChild(tdF); tr.appendChild(tdK); tr.appendChild(tdV); tr.appendChild(tdR);
          tbody.appendChild(tr);
        }
      }
    }
    table.appendChild(tbody);
    container.appendChild(table);
  }
}

export default {
  id: 'low-code-logs',
  name: 'Low-Code Logs toasts',
  description: 'Toast notifications for new low-code log entries on cplace pages, with per-field include/exclude filters.',
  defaultEnabled: false,
  snoozable: true,
  css: true,
  pageScript: true,
  defaultOptions: {
    pollIntervalSec: 15,
    maxToasts: 3,
    autoDismissMs: 8000,
    minLevel: 'info',
    stickyOnError: true,
  },
  renderOptions(container, ctx) {
    renderOptionsImpl(container, ctx).catch(() => {});
  },
  actions: [
    {
      id: 'reset-filters',
      label: 'Reset Low-Code Logs filters',
      icon: '🔄',
      async isVisible({ baseUrl }) {
        if (!baseUrl) return false;
        const all = await lowCodeLogsFiltersItem.getValue();
        return countFilters(all?.[baseUrl]) > 0;
      },
      async getLabel({ baseUrl }) {
        if (!baseUrl) return 'Reset Low-Code Logs filters';
        const all = await lowCodeLogsFiltersItem.getValue();
        const n = countFilters(all?.[baseUrl]);
        return n > 0 ? `Reset Low-Code Logs filters (${n} active)` : 'Reset Low-Code Logs filters';
      },
    },
  ],
  apply(options = {}, context = null) {
    pollMs = (typeof options.pollIntervalSec === 'number' && options.pollIntervalSec > 0
      ? options.pollIntervalSec : 15) * 1000;
    maxToasts = typeof options.maxToasts === 'number' && options.maxToasts > 0 ? options.maxToasts : 3;
    autoDismissMs = typeof options.autoDismissMs === 'number' && options.autoDismissMs >= 0
      ? options.autoDismissMs : 8000;
    minLevel = typeof options.minLevel === 'string' && LEVEL_ORDER[options.minLevel] != null
      ? options.minLevel : 'info';
    stickyOnError = options.stickyOnError !== false;
    const p = options.panelPosition;
    if (p && Number.isFinite(p.top) && Number.isFinite(p.right)) {
      stackPosition = { top: p.top, right: p.right };
    } else {
      stackPosition = { ...DEFAULT_POS };
    }
    const stackEl = document.getElementById(STACK_ID);
    if (stackEl) applyPosition(stackEl);
    currentContext = context;
    if (applied) return;
    applied = true;
    document.addEventListener('cplace:lowCodeLogsResult', onResult);
    // The page-world script (page.js) dispatches this once it has registered its
    // fetch listener. Registered here synchronously, so it is in place before the
    // injected script executes in a later macrotask — the first fetch is never lost.
    pageReadyHandler = () => {
      pageReady = true;
      maybeStartPolling();
    };
    document.addEventListener('cplace:lowCodeLogsPageReady', pageReadyHandler);
    visibilityHandler = () => {
      if (document.visibilityState === 'visible') maybeStartPolling();
      else stopPolling();
    };
    document.addEventListener('visibilitychange', visibilityHandler);
    resizeHandler = () => {
      const el = document.getElementById(STACK_ID);
      if (!el) return;
      const next = clampPosition(stackPosition, el);
      if (next.top !== stackPosition.top || next.right !== stackPosition.right) {
        stackPosition = next;
        applyPosition(el);
        persistPosition();
      }
    };
    window.addEventListener('resize', resizeHandler);
    filterWatcher = lowCodeLogsFiltersItem.watch((newValue) => {
      reevaluateActiveQueueAgainstFilters(newValue);
    });
    maybeStartPolling();
  },
  revert() {
    stopPolling();
    applied = false;
    document.removeEventListener('cplace:lowCodeLogsResult', onResult);
    // Note: pageReady is intentionally NOT reset — the page-world fetch listener
    // persists on document for the page's lifetime, so once ready, always ready.
    if (pageReadyHandler) {
      document.removeEventListener('cplace:lowCodeLogsPageReady', pageReadyHandler);
      pageReadyHandler = null;
    }
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
    if (typeof filterWatcher === 'function') {
      try { filterWatcher(); } catch (_) { /* ignore */ }
      filterWatcher = null;
    }
    clearStack();
    currentContext = null;
    stackPosition = { ...DEFAULT_POS };
  },
  async onAction(actionId, context) {
    if (actionId !== 'reset-filters') return;
    const baseUrl = context?.baseUrl ?? currentContext?.baseUrl ?? null;
    if (!baseUrl) return;
    const all = (await lowCodeLogsFiltersItem.getValue()) || {};
    if (all[baseUrl]) {
      delete all[baseUrl];
      await lowCodeLogsFiltersItem.setValue(all);
    }
  },
  onVersionDetected(context) {
    currentContext = context;
    maybeStartPolling();
  },
};
