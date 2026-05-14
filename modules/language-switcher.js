const SCRIPT_ID = 'cplace-language-switcher-script';
const TRIGGER_EVENT = 'cplace:doSwitchLanguage';

export default {
  id: 'language-switcher',
  name: 'Language Switcher',
  description: 'Switch the cplace display language via the extension popup.',
  defaultEnabled: false,
  actions: [{ id: 'switch-language', label: 'Switch language' }],
  apply() {
    if (document.getElementById(SCRIPT_ID)) return;
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = browser.runtime.getURL('language-switcher-page.js');
    (document.head || document.documentElement).appendChild(script);
  },
  revert() {
    const el = document.getElementById(SCRIPT_ID);
    if (el) el.remove();
  },
  onAction(actionId) {
    if (actionId === 'switch-language') {
      document.dispatchEvent(new CustomEvent(TRIGGER_EVENT));
    }
  },
};
