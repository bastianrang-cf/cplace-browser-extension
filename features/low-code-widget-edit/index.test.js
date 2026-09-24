import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const BASE = 'https://x.example/acme';
const CTX = { baseUrl: BASE };

const ADMIN_CLASS = 'cf-cplace-current-workspace-admin-access';

// Widgets are rendered inside #cplace, which carries the workspace-admin flag.
beforeEach(() => {
  document.documentElement.innerHTML = `<head></head><body><div id="cplace" class="${ADMIN_CLASS}"></div></body>`;
});

const cplaceRoot = () => document.getElementById('cplace');

let mod;
async function loadMod() {
  vi.resetModules();
  const m = await import('./index.js');
  mod = m.default;
  return m;
}

afterEach(() => {
  mod?.revert();
  mod = null;
});

// Mirrors the markup cplace renders for an embedded Low-Code Widget Builder widget.
function addWidget({ id = 'w1', defId = 'def123', header = false, title = 'My Widget', viaScriptOnly = false } = {}) {
  const w = document.createElement('div');
  w.className = 'jarviswidget' + (header ? '' : ' widget-no-frame');
  w.id = id;
  w.setAttribute('data-widget-kind', 'cf.cplace.lowCodeWidgetBuilder.embeddedWidget');
  if (title) w.setAttribute('data-widget-title', title);
  if (header) {
    w.innerHTML =
      '<header role="heading"><h2>' + title + '</h2>' +
      '<div class="jarviswidget-ctrls" role="menu"><a class="button-icon jarviswidget-toggle-btn"><i class="fa fa-minus"></i></a></div>' +
      '</header>';
  }
  const restrictor = document.createElement('div');
  restrictor.className = 'widget-height-restrictor';
  const bridge = document.createElement('cf-wc-bridge');
  bridge.id = `lcwb-embedded-${id}`;
  if (defId && !viaScriptOnly) {
    bridge.setAttribute('data', JSON.stringify({ entityUid: `page/${defId}`, widgetId: id, embeddingPageUid: 'page/emb' }));
  }
  restrictor.appendChild(bridge);
  if (defId) {
    const script = document.createElement('script');
    script.type = 'text/plain'; // inert in the test DOM
    script.textContent = `document.getElementById('${bridge.id}').setAttribute('data', JSON.stringify({\n  entityUid: "page/${defId}",\n  widgetId: "${id}"\n}));`;
    restrictor.appendChild(script);
  }
  w.appendChild(restrictor);
  cplaceRoot().appendChild(w);
  return w;
}

const buttons = () => [...document.querySelectorAll('.cplace-lcwe-btn')];

describe('low-code-widget-edit — helpers', () => {
  it('definitionUrl builds the page URL under the tenant baseUrl', async () => {
    const { definitionUrl } = await loadMod();
    expect(definitionUrl(BASE, 'tqggwk3v6k3lqiwndisx8ztg6')).toBe(`${BASE}/pages/tqggwk3v6k3lqiwndisx8ztg6`);
  });

  it('parseDefinitionId reads the entityUid from the bridge data attribute', async () => {
    const { parseDefinitionId } = await loadMod();
    expect(parseDefinitionId(addWidget({ defId: 'abc123' }))).toBe('abc123');
  });

  it('parseDefinitionId falls back to the inline script when data is not set yet', async () => {
    const { parseDefinitionId } = await loadMod();
    expect(parseDefinitionId(addWidget({ defId: 'fromscript', viaScriptOnly: true }))).toBe('fromscript');
  });

  it('parseDefinitionId returns null for missing or non-page uids', async () => {
    const { parseDefinitionId } = await loadMod();
    expect(parseDefinitionId(addWidget({ id: 'a', defId: null }))).toBeNull();
    const w = addWidget({ id: 'b' });
    w.querySelector('cf-wc-bridge').setAttribute('data', JSON.stringify({ entityUid: 'other/xyz' }));
    w.querySelector('script').remove();
    expect(parseDefinitionId(w)).toBeNull();
  });

  it('parseDefinitionId tolerates malformed data JSON', async () => {
    const { parseDefinitionId } = await loadMod();
    const w = addWidget({ defId: 'viascript' });
    w.querySelector('cf-wc-bridge').setAttribute('data', '{not json');
    expect(parseDefinitionId(w)).toBe('viascript');
  });
});

describe('low-code-widget-edit — descriptor', () => {
  it('is off by default, snoozable, and ships CSS', async () => {
    await loadMod();
    expect(mod.id).toBe('low-code-widget-edit');
    expect(mod.defaultEnabled).toBe(false);
    expect(mod.snoozable).toBe(true);
    expect(mod.css).toBe(true);
  });

  it('declares an adminOnly option that defaults to on', async () => {
    await loadMod();
    expect(mod.options).toEqual([expect.objectContaining({ id: 'adminOnly', type: 'boolean', default: true })]);
  });

  it('isWorkspaceAdmin reads the admin class on #cplace', async () => {
    const { isWorkspaceAdmin } = await loadMod();
    expect(isWorkspaceAdmin()).toBe(true);
    cplaceRoot().classList.remove(ADMIN_CLASS);
    expect(isWorkspaceAdmin()).toBe(false);
    cplaceRoot().remove();
    expect(isWorkspaceAdmin()).toBe(false);
  });
});

describe('low-code-widget-edit — workspace admin gate', () => {
  it('shows no button in workspaces the user does not administer', async () => {
    await loadMod();
    cplaceRoot().classList.remove(ADMIN_CLASS);
    addWidget();
    mod.apply({}, CTX);
    expect(buttons()).toHaveLength(0);
  });

  it('shows the button for everyone when adminOnly is off', async () => {
    await loadMod();
    cplaceRoot().classList.remove(ADMIN_CLASS);
    addWidget();
    mod.apply({ adminOnly: false }, CTX);
    expect(buttons()).toHaveLength(1);
  });

  it('treats a missing adminOnly option as on', async () => {
    await loadMod();
    cplaceRoot().classList.remove(ADMIN_CLASS);
    addWidget();
    mod.apply(undefined, CTX);
    expect(buttons()).toHaveLength(0);
  });

  it('follows the admin flag when it changes on the page', async () => {
    await loadMod();
    addWidget();
    mod.apply({}, CTX);
    expect(buttons()).toHaveLength(1);

    cplaceRoot().classList.remove(ADMIN_CLASS);
    await new Promise((r) => setTimeout(r, 250));
    expect(buttons()).toHaveLength(0);

    cplaceRoot().classList.add(ADMIN_CLASS);
    await new Promise((r) => setTimeout(r, 250));
    expect(buttons()).toHaveLength(1);
  });
});

describe('low-code-widget-edit — apply / revert', () => {
  it('puts the button first in the header controls when the widget has a header', async () => {
    await loadMod();
    const w = addWidget({ header: true, defId: 'hdr1' });
    mod.apply({}, CTX);

    const ctrls = w.querySelector('.jarviswidget-ctrls');
    const btn = ctrls.firstElementChild;
    expect(btn.classList.contains('cplace-lcwe-btn')).toBe(true);
    expect(btn.classList.contains('button-icon')).toBe(true);
    expect(btn.classList.contains('cplace-lcwe-overlay')).toBe(false);
    expect(btn.getAttribute('href')).toBe(`${BASE}/pages/hdr1`);
    expect(btn.getAttribute('target')).toBe('_blank');
    expect(btn.getAttribute('rel')).toBe('noopener');
    expect(btn.getAttribute('title')).toContain('My Widget');
    expect(w.classList.contains('cplace-lcwe-host')).toBe(false);
  });

  it('overlays the button on frameless widgets', async () => {
    await loadMod();
    const w = addWidget({ header: false, defId: 'ovl1' });
    mod.apply({}, CTX);

    const btn = w.querySelector(':scope > .cplace-lcwe-btn');
    expect(btn).not.toBeNull();
    expect(btn.classList.contains('cplace-lcwe-overlay')).toBe(true);
    expect(btn.classList.contains('button-icon')).toBe(false);
    expect(btn.getAttribute('href')).toBe(`${BASE}/pages/ovl1`);
    expect(w.classList.contains('cplace-lcwe-host')).toBe(true);
  });

  it('decorates every embedded widget and ignores other widget kinds', async () => {
    await loadMod();
    addWidget({ id: 'w1', defId: 'd1' });
    addWidget({ id: 'w2', defId: 'd2', header: true });
    const other = document.createElement('div');
    other.className = 'jarviswidget';
    other.setAttribute('data-widget-kind', 'cf.platform.embeddedSearch');
    cplaceRoot().appendChild(other);
    mod.apply({}, CTX);

    expect(buttons().map((b) => b.getAttribute('href'))).toEqual([`${BASE}/pages/d1`, `${BASE}/pages/d2`]);
    expect(other.querySelector('.cplace-lcwe-btn')).toBeNull();
  });

  it('skips widgets whose definition cannot be resolved', async () => {
    await loadMod();
    addWidget({ defId: null });
    mod.apply({}, CTX);
    expect(buttons()).toHaveLength(0);
  });

  it('is idempotent across repeated apply calls', async () => {
    await loadMod();
    addWidget({ header: true });
    addWidget({ id: 'w2' });
    mod.apply({}, CTX);
    mod.apply({}, CTX);
    expect(buttons()).toHaveLength(2);
  });

  it('stops the click from bubbling to cplace header handlers', async () => {
    await loadMod();
    const w = addWidget({ header: true });
    const headerClick = vi.fn();
    w.querySelector('header').addEventListener('click', headerClick);
    mod.apply({}, CTX);
    const btn = w.querySelector('.cplace-lcwe-btn');
    btn.addEventListener('click', (e) => e.preventDefault()); // keep the test DOM from navigating
    btn.click();
    expect(headerClick).not.toHaveBeenCalled();
  });

  it('revert removes all buttons and the host marker', async () => {
    await loadMod();
    const a = addWidget({ id: 'a' });
    addWidget({ id: 'b', header: true });
    mod.apply({}, CTX);
    expect(buttons()).toHaveLength(2);

    mod.revert();
    expect(buttons()).toHaveLength(0);
    expect(a.classList.contains('cplace-lcwe-host')).toBe(false);
  });

  it('waits for the tenant baseUrl before decorating', async () => {
    await loadMod();
    addWidget({ defId: 'late' });
    mod.apply({}, null);
    expect(buttons()).toHaveLength(0);

    mod.onVersionDetected({ baseUrl: BASE });
    expect(buttons().map((b) => b.getAttribute('href'))).toEqual([`${BASE}/pages/late`]);
  });

  it('updates existing hrefs when the baseUrl changes', async () => {
    await loadMod();
    addWidget({ defId: 'd1' });
    mod.apply({}, { baseUrl: 'https://x.example' });
    mod.onVersionDetected({ baseUrl: BASE });
    expect(buttons().map((b) => b.getAttribute('href'))).toEqual([`${BASE}/pages/d1`]);
  });

  it('does nothing on onVersionDetected after revert', async () => {
    await loadMod();
    addWidget();
    mod.apply({}, CTX);
    mod.revert();
    mod.onVersionDetected(CTX);
    expect(buttons()).toHaveLength(0);
  });
});

describe('low-code-widget-edit — DOM changes', () => {
  // Outlasts the module's rescan throttle (150 ms).
  const flush = () => new Promise((r) => setTimeout(r, 250));

  it('decorates widgets that are rendered after apply', async () => {
    await loadMod();
    mod.apply({}, CTX);
    expect(buttons()).toHaveLength(0);

    addWidget({ defId: 'later' });
    await flush();
    expect(buttons().map((b) => b.getAttribute('href'))).toEqual([`${BASE}/pages/later`]);
  });

  it('picks up the definition once the bridge data attribute is set', async () => {
    await loadMod();
    const w = addWidget({ defId: null });
    mod.apply({}, CTX);
    expect(buttons()).toHaveLength(0);

    w.querySelector('cf-wc-bridge').setAttribute('data', JSON.stringify({ entityUid: 'page/set-later' }));
    await flush();
    expect(buttons().map((b) => b.getAttribute('href'))).toEqual([`${BASE}/pages/set-later`]);
  });

  it('moves the button from overlay to header when the header is shown', async () => {
    await loadMod();
    const w = addWidget({ header: false });
    mod.apply({}, CTX);
    expect(w.querySelector(':scope > .cplace-lcwe-overlay')).not.toBeNull();

    const header = document.createElement('header');
    header.innerHTML = '<h2>My Widget</h2><div class="jarviswidget-ctrls"></div>';
    w.insertBefore(header, w.firstChild);
    await flush();

    expect(buttons()).toHaveLength(1);
    expect(header.querySelector('.jarviswidget-ctrls > .cplace-lcwe-btn.button-icon')).not.toBeNull();
    expect(w.classList.contains('cplace-lcwe-host')).toBe(false);
  });

  it('re-adds the button when cplace re-renders the header', async () => {
    await loadMod();
    const w = addWidget({ header: true });
    mod.apply({}, CTX);
    w.querySelector('.jarviswidget-ctrls').innerHTML = '<a class="button-icon"></a>';
    await flush();
    expect(w.querySelector('.jarviswidget-ctrls').firstElementChild.classList.contains('cplace-lcwe-btn')).toBe(true);
  });

  it('stops observing after revert', async () => {
    await loadMod();
    mod.apply({}, CTX);
    mod.revert();
    addWidget();
    await flush();
    expect(buttons()).toHaveLength(0);
  });
});
