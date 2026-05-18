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

export function injectPageScript(moduleId) {
  const id = `cplace-${moduleId}-script`;
  if (document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  script.src = browser.runtime.getURL(`${moduleId}-page.js`);
  (document.head || document.documentElement).appendChild(script);
}

export function removePageScript(moduleId) {
  document.getElementById(`cplace-${moduleId}-script`)?.remove();
}
