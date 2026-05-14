import { registry } from '../../modules/registry.js';

const STORAGE_KEY = 'enabledModules';
const list = document.getElementById('module-list');

function render(enabled) {
  list.textContent = '';
  for (const mod of registry.all()) {
    const li = document.createElement('li');
    const label = document.createElement('label');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.moduleId = mod.id;
    cb.checked = !!enabled[mod.id];
    cb.addEventListener('change', () => onToggle(mod.id, cb.checked));

    const text = document.createElement('span');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = mod.name;
    const desc = document.createElement('span');
    desc.className = 'description';
    desc.textContent = mod.description;
    text.appendChild(name);
    text.appendChild(desc);

    label.appendChild(cb);
    label.appendChild(text);
    li.appendChild(label);
    list.appendChild(li);
  }
}

async function onToggle(id, enabled) {
  const data = await browser.storage.local.get(STORAGE_KEY);
  const current = data[STORAGE_KEY] || {};
  current[id] = enabled;
  await browser.storage.local.set({ [STORAGE_KEY]: current });
  browser.runtime.sendMessage({ type: 'cplace:moduleToggle', id, enabled });
}

browser.storage.local.get(STORAGE_KEY).then((data) => {
  const defaults = registry.defaultEnabledMap();
  const enabled = { ...defaults, ...(data[STORAGE_KEY] || {}) };
  render(enabled);
});
