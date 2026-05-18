import { registry } from '../../features/registry.js';

const STORAGE_KEY = 'enabledModules';
const OPTIONS_KEY = 'moduleOptions';
const list = document.getElementById('module-list');

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

function render(enabled, savedOpts) {
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

    if (Array.isArray(mod.options) && mod.options.length > 0) {
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

      li.appendChild(optionsDiv);
    }

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

async function onOptionChange(moduleId, optId, type, input) {
  const value = type === 'number' ? Number(input.value) : type === 'boolean' ? input.checked : input.value;
  const data = await browser.storage.local.get(OPTIONS_KEY);
  const current = data[OPTIONS_KEY] || {};
  current[moduleId] = { ...(current[moduleId] || {}), [optId]: value };
  await browser.storage.local.set({ [OPTIONS_KEY]: current });
  browser.runtime.sendMessage({ type: 'cplace:moduleOptions', id: moduleId, options: current[moduleId] });
}

browser.storage.local.get([STORAGE_KEY, OPTIONS_KEY]).then((data) => {
  const defaults = registry.defaultEnabledMap();
  const enabled = { ...defaults, ...(data[STORAGE_KEY] || {}) };
  const savedOpts = data[OPTIONS_KEY] || {};
  render(enabled, savedOpts);
});
