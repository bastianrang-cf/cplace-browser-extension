import { injectScript } from 'wxt/utils/inject-script';

export function injectModuleCSS(moduleId) {
  const id = `cplace-${moduleId}-link`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.id = id;
  link.href = browser.runtime.getURL(`${moduleId}-module.css`);
  (document.head || document.documentElement).appendChild(link);
}

export function removeModuleCSS(moduleId) {
  document.getElementById(`cplace-${moduleId}-link`)?.remove();
}

export async function injectPageScript(moduleId) {
  const id = `cplace-${moduleId}-script`;
  if (document.getElementById(id)) return;
  await injectScript(`/${moduleId}-page.js`, {
    keepInDom: true,
    modifyScript(el) { el.id = id; },
  }).catch(() => {});
}

export function removePageScript(moduleId) {
  document.getElementById(`cplace-${moduleId}-script`)?.remove();
}
