export default {
  id: 'language-switcher',
  name: 'Language Switcher',
  description: 'Switch the cplace display language via the extension popup.',
  defaultEnabled: false,
  pageScript: true,
  actions: [{ id: 'switch-language', label: 'Switch language' }],
  onAction(actionId) {
    if (actionId === 'switch-language') {
      document.dispatchEvent(new CustomEvent('cplace:doSwitchLanguage'));
    }
  },
};
