import { registry } from '../../features/registry.js';
import { enabledModulesItem, moduleOptionsItem } from '../../features/storage.js';
import {
  hasUniversalHostAccess,
  requestUniversalHostAccess,
  revokeUniversalHostAccess,
} from '../../features/permissions.js';

let liveOpts = {};
let activeSectionId = null;

const sidebar = document.getElementById('sidebar');
const content = document.getElementById('content');
const heroStatus = document.getElementById('hero-status');

const HOST_SECTION_ID = 'sec-host-access';

function setActiveSection(id) {
  activeSectionId = id;
  for (const btn of sidebar.querySelectorAll('.sidebar__item')) {
    btn.classList.toggle('is-active', btn.dataset.section === id);
  }
  for (const sec of content.querySelectorAll('section')) {
    sec.hidden = sec.id !== id;
  }
}

sidebar.addEventListener('click', (e) => {
  const btn = e.target.closest('.sidebar__item');
  if (!btn) return;
  setActiveSection(btn.dataset.section);
});

function makeSidebarItem(sectionId, title, subtitle) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sidebar__item';
  btn.dataset.section = sectionId;
  const t = document.createElement('span');
  t.className = 'sidebar__item-title';
  t.textContent = title;
  btn.appendChild(t);
  if (subtitle) {
    const s = document.createElement('span');
    s.className = 'sidebar__item-sub';
    s.textContent = subtitle;
    btn.appendChild(s);
  }
  return btn;
}

function makeSection(id, title, description) {
  const section = document.createElement('section');
  section.id = id;
  section.hidden = true;

  const head = document.createElement('div');
  head.className = 'section__head';

  const titleWrap = document.createElement('div');
  const h2 = document.createElement('h2');
  h2.className = 'section__title';
  h2.textContent = title;
  titleWrap.appendChild(h2);
  if (description) {
    const p = document.createElement('p');
    p.className = 'section__desc';
    p.textContent = description;
    titleWrap.appendChild(p);
  }
  head.appendChild(titleWrap);

  section.appendChild(head);
  return { section, head };
}

function makeToggle(moduleId, checked) {
  const label = document.createElement('label');
  label.className = 'module-toggle';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.dataset.moduleId = moduleId;
  cb.checked = !!checked;
  cb.addEventListener('change', () => onToggle(moduleId, cb.checked));

  const track = document.createElement('span');
  track.className = 'module-toggle__track';

  const text = document.createElement('span');
  text.className = 'module-toggle__label';
  text.textContent = checked ? 'Enabled' : 'Disabled';

  cb.addEventListener('change', () => {
    text.textContent = cb.checked ? 'Enabled' : 'Disabled';
  });

  label.appendChild(cb);
  label.appendChild(track);
  label.appendChild(text);
  return label;
}

function buildOptionInput(opt, currentValue) {
  const input = document.createElement('input');
  if (opt.type === 'boolean') {
    input.type = 'checkbox';
    input.checked = !!currentValue;
  } else if (opt.type === 'number') {
    input.type = 'number';
    input.value = currentValue ?? opt.default;
  } else {
    input.type = 'text';
    input.value = currentValue ?? opt.default ?? '';
  }
  return input;
}

function renderHostAccessSection() {
  const { section, head } = makeSection(
    HOST_SECTION_ID,
    'Host access',
    'The extension reads pages to detect cplace. Grant access once, then feature modules run automatically on cplace pages.',
  );

  const status = document.createElement('p');
  status.id = 'host-access-status';
  status.className = 'host-access__status';

  const actions = document.createElement('div');
  actions.className = 'host-access__actions';

  const grantBtn = document.createElement('button');
  grantBtn.type = 'button';
  grantBtn.id = 'host-access-grant';
  grantBtn.className = 'host-access__grant';
  grantBtn.textContent = 'Enable on all pages';
  grantBtn.hidden = true;

  const revokeBtn = document.createElement('button');
  revokeBtn.type = 'button';
  revokeBtn.id = 'host-access-revoke';
  revokeBtn.className = 'host-access__revoke';
  revokeBtn.textContent = 'Revoke access';
  revokeBtn.hidden = true;

  grantBtn.addEventListener('click', async () => {
    const accepted = await requestUniversalHostAccess();
    if (accepted) refreshHostAccess();
  });
  revokeBtn.addEventListener('click', async () => {
    await revokeUniversalHostAccess();
    refreshHostAccess();
  });

  actions.appendChild(grantBtn);
  actions.appendChild(revokeBtn);

  section.appendChild(status);
  section.appendChild(actions);
  return section;
}

async function refreshHostAccess() {
  const granted = await hasUniversalHostAccess();
  const status = document.getElementById('host-access-status');
  const grantBtn = document.getElementById('host-access-grant');
  const revokeBtn = document.getElementById('host-access-revoke');
  if (status) {
    status.dataset.state = granted ? 'granted' : 'missing';
    status.textContent = granted
      ? 'The extension is active on all pages.'
      : 'The extension needs permission to read pages so it can detect cplace. Enable it once below.';
  }
  if (grantBtn) grantBtn.hidden = granted;
  if (revokeBtn) revokeBtn.hidden = !granted;

  heroStatus.hidden = false;
  heroStatus.dataset.state = granted ? 'granted' : 'missing';
  heroStatus.textContent = granted ? 'Active on all pages' : 'Permission needed';

  content.setAttribute('aria-disabled', granted ? 'false' : 'true');
}

function renderModuleSection(mod, enabledMap, savedOpts) {
  const sectionId = `sec-mod-${mod.id}`;
  const { section, head } = makeSection(sectionId, mod.name, mod.description);
  section.classList.add('module-section');

  head.appendChild(makeToggle(mod.id, !!enabledMap[mod.id]));

  if (typeof mod.renderOptions === 'function') {
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'module-options';
    const defaults = registry.defaultOptionsMap()[mod.id] || {};
    mod.renderOptions(optionsDiv, {
      getOptions: () => liveOpts[mod.id] ?? defaults,
      setOptions: async (next) => {
        liveOpts[mod.id] = next;
        const current = await moduleOptionsItem.getValue();
        current[mod.id] = next;
        await moduleOptionsItem.setValue(current);
        browser.runtime.sendMessage({ type: 'cplace:moduleOptions', id: mod.id, options: next });
      },
      getDefaults: () => defaults,
    });
    section.appendChild(optionsDiv);
  } else if (Array.isArray(mod.options) && mod.options.length > 0) {
    const modOpts = savedOpts[mod.id] || {};
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'module-options';
    for (const opt of mod.options) {
      const row = document.createElement('label');
      row.className = 'module-option-row';
      const optLabel = document.createElement('span');
      optLabel.textContent = opt.label;
      const input = buildOptionInput(opt, modOpts[opt.id]);
      input.addEventListener('change', () => onOptionChange(mod.id, opt.id, opt.type, input));
      row.appendChild(optLabel);
      row.appendChild(input);
      optionsDiv.appendChild(row);
    }
    section.appendChild(optionsDiv);
  }

  return section;
}

function render(enabledMap, savedOpts) {
  liveOpts = savedOpts;
  sidebar.textContent = '';
  content.textContent = '';

  // Host access first
  sidebar.appendChild(makeSidebarItem(HOST_SECTION_ID, 'Host access', 'Permission status'));
  content.appendChild(renderHostAccessSection());

  // Divider
  const divider = document.createElement('div');
  divider.className = 'sidebar__divider';
  divider.setAttribute('aria-hidden', 'true');
  sidebar.appendChild(divider);

  // Module sections
  const mods = registry.all();
  for (const mod of mods) {
    sidebar.appendChild(makeSidebarItem(`sec-mod-${mod.id}`, mod.name, mod.description));
    content.appendChild(renderModuleSection(mod, enabledMap, savedOpts));
  }

  // Restore previous active section if it still exists; else pick a sensible default.
  const preferred =
    activeSectionId && content.querySelector(`#${CSS.escape(activeSectionId)}`)
      ? activeSectionId
      : HOST_SECTION_ID;
  setActiveSection(preferred);
}

async function onToggle(id, enabled) {
  const current = await enabledModulesItem.getValue();
  current[id] = enabled;
  await enabledModulesItem.setValue(current);
  browser.runtime.sendMessage({ type: 'cplace:moduleToggle', id, enabled });
}

async function onOptionChange(moduleId, optId, type, input) {
  const value =
    type === 'number' ? Number(input.value) : type === 'boolean' ? input.checked : input.value;
  const current = await moduleOptionsItem.getValue();
  current[moduleId] = { ...(current[moduleId] || {}), [optId]: value };
  await moduleOptionsItem.setValue(current);
  browser.runtime.sendMessage({
    type: 'cplace:moduleOptions',
    id: moduleId,
    options: current[moduleId],
  });
}

browser.permissions.onAdded.addListener(refreshHostAccess);
browser.permissions.onRemoved.addListener(refreshHostAccess);

Promise.all([enabledModulesItem.getValue(), moduleOptionsItem.getValue()]).then(
  async ([stored, savedOpts]) => {
    const defaults = registry.defaultEnabledMap();
    const enabled = { ...defaults, ...stored };
    render(enabled, savedOpts);
    await refreshHostAccess();
    // If permission is missing, default to the host-access section so it's the first thing the user sees.
    const granted = await hasUniversalHostAccess();
    if (!granted) setActiveSection(HOST_SECTION_ID);
  },
);
