const navLinks = [
  { label: 'All Workspaces',     path: '/space/allSpaces' },
  { label: 'All Packages',       path: '/solutionmanagement/viewAll' },
  { label: 'Batch Jobs',         path: '/batchJob/jobs' },
  { label: 'Low-Code Dashboard', path: '/cplacejsAdmin/cplaceJSDashboard' },
  { label: 'Low-Code Logs',      path: '/cplacejsAdmin/cplaceJSLogs' },
  { label: 'API Tokens',         path: '/cf/cplace/apiToken/handler/viewAll' },
  { label: 'AI Settings',        path: '/application/viewAiSettings' },
  { label: 'Deleted Items',      path: '/restorable/trashCanPages' },
  { label: 'Activity Stream',    path: '/awareness/recentChanges' },
  { label: 'My Drafts',          path: '/draft/myDrafts' },
];

function renderOptions(container, ctx) {
  container.textContent = '';
  container.classList.add('nav-links-editor');

  const hint = document.createElement('p');
  hint.className = 'nav-links-hint';
  hint.textContent = 'Choose which links to show in the popup’s Navigation menu.';
  container.appendChild(hint);

  const current = ctx.getOptions() || {};
  const disabled = new Set(Array.isArray(current.disabledPaths) ? current.disabledPaths : []);

  for (const { label, path } of navLinks) {
    const row = document.createElement('label');
    row.className = 'module-option-row nav-links-row';

    const text = document.createElement('span');
    text.textContent = label;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !disabled.has(path);
    cb.addEventListener('change', () => {
      if (cb.checked) disabled.delete(path);
      else disabled.add(path);
      ctx.setOptions({ disabledPaths: Array.from(disabled) });
    });

    row.appendChild(text);
    row.appendChild(cb);
    container.appendChild(row);
  }
}

export default {
  id: 'nav-links',
  name: 'Navigation Links',
  description: 'Adds a Navigation button to the popup with quick links to common cplace pages.',
  defaultEnabled: true,
  defaultOptions: { disabledPaths: [] },
  navLinks,
  renderOptions,
};
