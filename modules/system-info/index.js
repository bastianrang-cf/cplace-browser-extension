const DIALOG_ID = 'cplace-system-info-dialog';

let onResult = null;
let onKey = null;
let active = false;

function formatBuildTime(raw) {
  if (!raw) return raw;
  const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (!m) return raw;
  return `${m[1]} ${m[2]}:${m[3]}:${m[4]}`;
}

function parseChangeSet(raw) {
  if (raw == null) return { commit: raw, version: null };
  const m = String(raw).match(/^([^(]+)\(([^)]+)\)$/);
  if (m) return { commit: m[1], version: m[2] };
  return { commit: String(raw), version: null };
}

function formatChangeSet(raw) {
  const { commit, version } = parseChangeSet(raw);
  if (version) return `Commit: ${commit} Version: ${version}`;
  return commit != null ? commit : '';
}

function releaseToKbUrl(release) {
  if (!release) return null;
  return `https://kb.cplace.com/release-information/readme/${String(release).replace(/\./g, '-')}`;
}

function buildIdentifierRow(b) {
  const tr = document.createElement('tr');
  const { version } = parseChangeSet(b.changeSetId);
  if (!version || !version.startsWith('release-version')) {
    tr.className = 'cplace-si-row-warn';
  }
  for (const [key, text] of [
    ['name', b.name != null ? String(b.name) : ''],
    ['changeSetId', formatChangeSet(b.changeSetId)],
    ['buildTime', formatBuildTime(b.buildTime) ?? ''],
  ]) {
    const td = document.createElement('td');
    td.textContent = text;
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
    ['Change set', formatChangeSet(main.changeSetId) || (main.changeSetId != null ? String(main.changeSetId) : null)],
    ['Build time', formatBuildTime(main.buildTime)],
  ]) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    if (label === 'Release' && value != null) {
      const url = releaseToKbUrl(value);
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = String(value);
        dd.appendChild(a);
      } else {
        dd.textContent = String(value);
      }
    } else {
      dd.textContent = value != null ? String(value) : '—';
    }
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
    for (const h of ['Name', 'Change set', 'Build time']) {
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
