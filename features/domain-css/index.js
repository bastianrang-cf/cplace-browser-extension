import { seedRules } from './seed.js';

let appliedCss = null;

function escapeRegex(s) {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

export function compileGlob(pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0) return null;
  const slashIdx = pattern.indexOf('/');
  let hostPart, pathPart;
  if (slashIdx === -1) {
    hostPart = pattern;
    pathPart = null;
  } else {
    hostPart = pattern.slice(0, slashIdx);
    pathPart = pattern.slice(slashIdx);
  }
  if (hostPart.length === 0) return null;
  const toRe = (s) => new RegExp('^' + escapeRegex(s).replace(/\*/g, '.*') + '$');
  return { hostRe: toRe(hostPart), pathRe: pathPart ? toRe(pathPart) : null };
}

export function ruleMatches(rule, hostname, pathname) {
  if (!rule || typeof rule.pattern !== 'string') return false;
  const g = compileGlob(rule.pattern);
  if (!g) return false;
  if (!g.hostRe.test(hostname)) return false;
  if (g.pathRe && !g.pathRe.test(pathname)) return false;
  return true;
}

function computeCss(rules) {
  const hostname = location.hostname;
  const pathname = location.pathname;
  const chunks = [];
  for (const rule of rules) {
    if (!rule || typeof rule.css !== 'string' || rule.css.length === 0) continue;
    if (ruleMatches(rule, hostname, pathname)) chunks.push(rule.css);
  }
  return chunks.join('\n\n');
}

function renderEditor(container, ctx) {
  container.textContent = '';
  container.classList.add('domain-css-editor');

  let working = (ctx.getOptions() && Array.isArray(ctx.getOptions().rules))
    ? ctx.getOptions().rules.map((r) => ({ pattern: r.pattern ?? '', css: r.css ?? '' }))
    : [];

  function persist() {
    ctx.setOptions({ rules: working.map((r) => ({ pattern: r.pattern, css: r.css })) });
  }

  function render() {
    container.textContent = '';

    const hint = document.createElement('p');
    hint.className = 'domain-css-hint';
    hint.textContent = 'Each rule injects CSS on pages matching its hostname[/pathPrefix] glob. Use * as a wildcard. Rules only apply on cplace pages.';
    container.appendChild(hint);

    working.forEach((rule, idx) => {
      const row = document.createElement('div');
      row.className = 'domain-css-rule-row';

      const patternInput = document.createElement('input');
      patternInput.type = 'text';
      patternInput.className = 'domain-css-pattern';
      patternInput.placeholder = '*.cplace.cloud  or  host.tld/prefix-*';
      patternInput.value = rule.pattern;
      patternInput.addEventListener('input', () => {
        working[idx].pattern = patternInput.value;
        validate(row, working[idx], cssInput);
      });
      patternInput.addEventListener('change', persist);

      const cssInput = document.createElement('textarea');
      cssInput.className = 'domain-css-css';
      cssInput.rows = 4;
      cssInput.placeholder = '/* CSS to inject on matching pages */';
      cssInput.value = rule.css;
      cssInput.addEventListener('input', () => {
        working[idx].css = cssInput.value;
        validate(row, working[idx], cssInput);
      });
      cssInput.addEventListener('change', persist);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'domain-css-remove';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        working.splice(idx, 1);
        persist();
        render();
      });

      const error = document.createElement('div');
      error.className = 'domain-css-error';
      error.hidden = true;

      row.appendChild(patternInput);
      row.appendChild(cssInput);
      row.appendChild(removeBtn);
      row.appendChild(error);
      container.appendChild(row);

      validate(row, working[idx], cssInput);
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'domain-css-add-rule';
    addBtn.textContent = 'Add rule';
    addBtn.addEventListener('click', () => {
      working.push({ pattern: '', css: '' });
      persist();
      render();
    });
    container.appendChild(addBtn);
  }

  function validate(row, rule, cssInput) {
    const errEl = row.querySelector('.domain-css-error');
    const messages = [];
    if (rule.pattern && !compileGlob(rule.pattern)) messages.push('Invalid pattern.');
    if (rule.css) {
      try {
        if (typeof CSSStyleSheet !== 'undefined' && typeof new CSSStyleSheet().replaceSync === 'function') {
          new CSSStyleSheet().replaceSync(rule.css);
        }
      } catch (e) {
        messages.push('CSS parse warning: ' + (e?.message || 'invalid CSS'));
      }
    }
    if (messages.length === 0) {
      errEl.hidden = true;
      errEl.textContent = '';
      cssInput.removeAttribute('aria-invalid');
    } else {
      errEl.hidden = false;
      errEl.textContent = messages.join(' ');
      cssInput.setAttribute('aria-invalid', 'true');
    }
  }

  render();
}

const descriptor = {
  id: 'domain-css',
  name: 'Domain CSS injection',
  description:
    'Inject custom CSS on cplace pages matching a hostname/path glob. Use it for environment labels, admin highlighting, or other per-tenant visual cues.',
  defaultEnabled: false,
  defaultOptions: { rules: seedRules.map((r) => ({ ...r })) },
  apply(options = {}) {
    const rules = Array.isArray(options.rules) ? options.rules : [];
    const next = computeCss(rules);
    if (next === (appliedCss ?? '')) return;
    if (next) {
      appliedCss = next;
      try { browser.runtime.sendMessage({ type: 'cplace:domainCss:apply', css: next }); } catch (_) {}
    } else if (appliedCss != null) {
      appliedCss = null;
      try { browser.runtime.sendMessage({ type: 'cplace:domainCss:revert' }); } catch (_) {}
    }
  },
  revert() {
    if (appliedCss != null) {
      appliedCss = null;
      try { browser.runtime.sendMessage({ type: 'cplace:domainCss:revert' }); } catch (_) {}
    }
  },
  renderOptions(container, ctx) {
    renderEditor(container, ctx);
  },
};

export default descriptor;
