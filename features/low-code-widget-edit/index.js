// Adds an "edit" link to every embedded Low-Code Widget Builder widget that opens the
// widget's definition page in a new tab. The link goes into the widget header's control
// strip when the widget shows a header, otherwise it is overlaid on the widget content.
// By default the link is only shown in workspaces the current user administers.
//
// The embedded widget is rendered through a <cf-wc-bridge id="lcwb-embedded-<widgetId>">
// whose `data` attribute (set by an inline script next to it) is a JSON blob carrying
// the definition's uid, e.g. { entityUid: "page/<id>", widgetId, embeddingPageUid, ... }.

export const WIDGET_KIND = 'cf.cplace.lowCodeWidgetBuilder.embeddedWidget';
const WIDGET_SELECTOR = `[data-widget-kind="${WIDGET_KIND}"]`;
const BUTTON_CLASS = 'cplace-lcwe-btn';
const OVERLAY_CLASS = 'cplace-lcwe-overlay';
const HOST_CLASS = 'cplace-lcwe-host';
// Set by cplace on #cplace when the current user is admin of the current workspace.
const WORKSPACE_ADMIN_CLASS = 'cf-cplace-current-workspace-admin-access';
const SVG_NS = 'http://www.w3.org/2000/svg';
// Pencil glyph (16×16), drawn inline so the button does not depend on the instance's
// icon font version.
const PENCIL_PATH = 'M11.3 1.3a1 1 0 0 1 1.4 0l2 2a1 1 0 0 1 0 1.4L5.4 14H2v-3.4z';
const RESCAN_THROTTLE_MS = 150;

let active = false;
let adminOnly = true;
let currentContext = null;
let observer = null;
let rescanTimer = null;

// The definition page id of an embedded widget, or null when it can't be resolved.
// Reads the bridge's `data` attribute first and falls back to the inline script that
// sets it, in case the script has not run yet.
export function parseDefinitionId(widgetEl) {
  const uid = readEntityUid(widgetEl);
  const match = typeof uid === 'string' ? uid.match(/^page\/([A-Za-z0-9_-]+)$/) : null;
  return match ? match[1] : null;
}

function readEntityUid(widgetEl) {
  const bridge = widgetEl?.querySelector?.('cf-wc-bridge');
  const raw = bridge?.getAttribute('data');
  if (raw) {
    try {
      const uid = JSON.parse(raw)?.entityUid;
      if (uid) return uid;
    } catch (_) {
      // fall through to the inline script
    }
  }
  for (const script of widgetEl?.querySelectorAll?.('script') || []) {
    const m = (script.textContent || '').match(/entityUid\s*:\s*"([^"]+)"/);
    if (m) return m[1];
  }
  return null;
}

export function definitionUrl(baseUrl, id) {
  return `${baseUrl}/pages/${encodeURIComponent(id)}`;
}

export function isWorkspaceAdmin(doc = document) {
  return !!doc.getElementById('cplace')?.classList.contains(WORKSPACE_ADMIN_CLASS);
}

// Where the button belongs: the header's control strip, the bare header, or — for
// frameless widgets — an overlay on the widget itself.
function resolvePlacement(widgetEl) {
  const header = widgetEl.querySelector(':scope > header');
  if (!header) return { mode: 'overlay', parent: widgetEl };
  const ctrls = header.querySelector('.jarviswidget-ctrls');
  return { mode: 'header', parent: ctrls || header };
}

function createButton(mode, url, title) {
  const a = document.createElement('a');
  a.className = mode === 'header' ? `${BUTTON_CLASS} button-icon` : `${BUTTON_CLASS} ${OVERLAY_CLASS}`;
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  const label = title ? `Open widget definition "${title}" in a new tab` : 'Open widget definition in a new tab';
  a.title = label;
  a.setAttribute('aria-label', label);
  a.dataset.cplaceLcweMode = mode;
  // Keep the click away from cplace's header handlers (collapse, drag, …); the default
  // action — following the link into a new tab — still happens.
  a.addEventListener('click', (e) => e.stopPropagation());

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', PENCIL_PATH);
  svg.appendChild(path);
  a.appendChild(svg);
  return a;
}

// The button this feature placed for `widgetEl`, ignoring buttons of nested widgets.
function findButton(widgetEl) {
  for (const btn of widgetEl.querySelectorAll(`.${BUTTON_CLASS}`)) {
    if (btn.closest(WIDGET_SELECTOR) === widgetEl) return btn;
  }
  return null;
}

function decorate(widgetEl, baseUrl) {
  const id = parseDefinitionId(widgetEl);
  const existing = findButton(widgetEl);
  if (!id) {
    existing?.remove();
    return;
  }
  const url = definitionUrl(baseUrl, id);
  const { mode, parent } = resolvePlacement(widgetEl);
  if (existing && existing.parentElement === parent && existing.dataset.cplaceLcweMode === mode) {
    if (existing.getAttribute('href') !== url) existing.href = url;
    return;
  }
  existing?.remove();
  const btn = createButton(mode, url, widgetEl.getAttribute('data-widget-title'));
  if (mode === 'overlay') {
    widgetEl.classList.add(HOST_CLASS);
    parent.appendChild(btn);
  } else {
    widgetEl.classList.remove(HOST_CLASS);
    parent.insertBefore(btn, parent.firstChild);
  }
}

function scan() {
  const baseUrl = currentContext?.baseUrl;
  if (!active || !baseUrl) return;
  if (adminOnly && !isWorkspaceAdmin()) {
    cleanup();
    return;
  }
  for (const widgetEl of document.querySelectorAll(WIDGET_SELECTOR)) decorate(widgetEl, baseUrl);
}

// Throttled rather than debounced: a page that keeps mutating the DOM (live dashboards)
// would otherwise postpone the scan forever.
function scheduleScan() {
  if (rescanTimer) return;
  rescanTimer = setTimeout(() => {
    rescanTimer = null;
    scan();
  }, RESCAN_THROTTLE_MS);
}

// Mutations that can change what the scan produces: added/removed nodes, the bridge's
// `data` attribute (where it learns its definition uid), and the class list of #cplace
// (which carries the workspace-admin flag).
function isRelevant(record) {
  if (record.type === 'childList') return true;
  if (record.attributeName === 'data') return true;
  return record.attributeName === 'class' && record.target?.id === 'cplace';
}

// cplace renders widgets asynchronously (tabs, alternative layouts, widget reloads), so
// watch the DOM and re-decorate. Our own insertions trigger one extra no-op scan.
function startObserving() {
  if (observer) return;
  observer = new MutationObserver((records) => {
    if (records.some(isRelevant)) scheduleScan();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data', 'class'],
  });
}

function cleanup() {
  for (const btn of document.querySelectorAll(`.${BUTTON_CLASS}`)) btn.remove();
  for (const el of document.querySelectorAll(`.${HOST_CLASS}`)) el.classList.remove(HOST_CLASS);
}

export default {
  id: 'low-code-widget-edit',
  name: 'Low-Code Widget edit button',
  description:
    'Adds an edit button to embedded Low-Code Widget Builder widgets that opens the widget definition in a new tab — in the widget header when it is shown, otherwise as a small overlay on the widget content. By default only shown in workspaces where you are admin.',
  defaultEnabled: false,
  snoozable: true,
  css: true,
  options: [
    { id: 'adminOnly', label: 'Only in workspaces where I am admin', type: 'boolean', default: true },
  ],
  apply(options = {}, context = null) {
    adminOnly = options.adminOnly !== false;
    currentContext = context;
    active = true;
    startObserving();
    scan();
  },
  revert() {
    active = false;
    observer?.disconnect();
    observer = null;
    if (rescanTimer) clearTimeout(rescanTimer);
    rescanTimer = null;
    cleanup();
  },
  // The tenant baseUrl may only be known once version detection has run; decorate (or
  // fix up the hrefs of) the widgets then.
  onVersionDetected(context) {
    currentContext = context;
    scan();
  },
};
