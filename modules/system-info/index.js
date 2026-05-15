const DIALOG_ID = 'cplace-system-info-dialog';

let onResult = null;
let onKey = null;
let active = false;

function buildIdentifierRow(b) {
  const tr = document.createElement('tr');
  for (const key of ['name', 'release', 'changeSetId', 'buildTime']) {
    const td = document.createElement('td');
    td.textContent = b[key] != null ? String(b[key]) : '';
    tr.appendChild(td);
  }
  return tr;
}

function renderContent(data) {
  const wrap = document.createElement('div');
  wrap.className = 'cplace-si-content';

  const main = data.mainBuildIdentifier || {};
  const mainBox = document.createElement('div');
  mainBox.className = 'cplace-si-main';
  const mainTitle = document.createElement('div');
  mainTitle.className = 'cplace-si-section-title';
  mainTitle.textContent = 'Main build';
  mainBox.appendChild(mainTitle);
  const dl = document.createElement('dl');
  dl.className = 'cplace-si-dl';
  for (const [label, value] of [
    ['Name', main.name],
    ['Release', main.release],
    ['Change set', main.changeSetId],
    ['Build time', main.buildTime],
  ]) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value != null ? String(value) : '—';
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
  mainBox.appendChild(dl);
  wrap.appendChild(mainBox);

  const builds = Array.isArray(data.buildIdentifiers) ? data.buildIdentifiers : [];
  if (builds.length) {
    const listTitle = document.createElement('div');
    listTitle.className = 'cplace-si-section-title';
    listTitle.textContent = `Build identifiers (${builds.length})`;
    wrap.appendChild(listTitle);

    const table = document.createElement('table');
    table.className = 'cplace-si-table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const h of ['Name', 'Release', 'Change set', 'Build time']) {
      const th = document.createElement('th');
      th.textContent = h;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const b of builds) tbody.appendChild(buildIdentifierRow(b));
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  if (data.mayViewAllSystemInfo) {
    const links = [];
    if (data.systemStatusUrl) {
      links.push({ label: 'System status', href: data.systemStatusUrl });
    }
    if (data.fossPageUrl) {
      links.push({ label: 'Open source libraries', href: data.fossPageUrl });
    }
    if (links.length) {
      const linkBar = document.createElement('div');
      linkBar.className = 'cplace-si-links';
      for (const { label, href } of links) {
        const a = document.createElement('a');
        a.href = new URL(href, window.location.origin).href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = label;
        linkBar.appendChild(a);
      }
      wrap.appendChild(linkBar);
    }
  }

  return wrap;
}

function renderError(message) {
  const wrap = document.createElement('div');
  wrap.className = 'cplace-si-content';
  const err = document.createElement('p');
  err.className = 'cplace-si-error';
  err.textContent = `Failed to load system info: ${message}`;
  wrap.appendChild(err);
  return wrap;
}

function closeDialog() {
  document.getElementById(DIALOG_ID)?.remove();
}

function showDialog(body) {
  closeDialog();

  const dialog = document.createElement('div');
  dialog.id = DIALOG_ID;

  const backdrop = document.createElement('div');
  backdrop.className = 'cplace-si-backdrop';
  backdrop.addEventListener('click', closeDialog);

  const panel = document.createElement('div');
  panel.className = 'cplace-si-panel';
  panel.addEventListener('click', (e) => e.stopPropagation());

  const header = document.createElement('div');
  header.className = 'cplace-si-header';
  const title = document.createElement('span');
  title.textContent = 'System Information';
  const close = document.createElement('button');
  close.className = 'cplace-si-close';
  close.type = 'button';
  close.textContent = '✕';
  close.addEventListener('click', closeDialog);
  header.appendChild(title);
  header.appendChild(close);

  panel.appendChild(header);
  panel.appendChild(body);
  backdrop.appendChild(panel);
  dialog.appendChild(backdrop);
  document.body.appendChild(dialog);
}

export default {
  id: 'system-info',
  name: 'System Information',
  description: 'Adds a "System Info" popup button that fetches the tenant\'s system info and shows it in a dialog.',
  defaultEnabled: false,
  css: true,
  pageScript: true,
  actions: [{ id: 'show-system-info', label: 'System Info' }],
  apply() {
    if (active) return;
    active = true;
    onResult = (event) => {
      const { data, error } = event.detail || {};
      if (error || !data) {
        showDialog(renderError(error || 'No data returned'));
      } else {
        showDialog(renderContent(data));
      }
    };
    onKey = (event) => {
      if (event.key === 'Escape') closeDialog();
    };
    document.addEventListener('cplace:systemInfoResult', onResult);
    document.addEventListener('keydown', onKey);
  },
  revert() {
    if (onResult) document.removeEventListener('cplace:systemInfoResult', onResult);
    if (onKey) document.removeEventListener('keydown', onKey);
    onResult = null;
    onKey = null;
    active = false;
    closeDialog();
  },
  onAction(actionId) {
    if (actionId === 'show-system-info') {
      document.dispatchEvent(new CustomEvent('cplace:fetchSystemInfo'));
    }
  },
};
