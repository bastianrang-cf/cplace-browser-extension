import { registry } from '../../features/registry.js';
import { enabledModulesItem, moduleOptionsItem } from '../../features/storage.js';

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
  const current = await enabledModulesItem.getValue();
  current[id] = enabled;
  await enabledModulesItem.setValue(current);
  browser.runtime.sendMessage({ type: 'cplace:moduleToggle', id, enabled });
}

async function onOptionChange(moduleId, optId, type, input) {
  const value = type === 'number' ? Number(input.value) : type === 'boolean' ? input.checked : input.value;
  const current = await moduleOptionsItem.getValue();
  current[moduleId] = { ...(current[moduleId] || {}), [optId]: value };
  await moduleOptionsItem.setValue(current);
  browser.runtime.sendMessage({ type: 'cplace:moduleOptions', id: moduleId, options: current[moduleId] });
}

Promise.all([enabledModulesItem.getValue(), moduleOptionsItem.getValue()]).then(
  ([stored, savedOpts]) => {
    const defaults = registry.defaultEnabledMap();
    const enabled = { ...defaults, ...stored };
    render(enabled, savedOpts);
  },
);
