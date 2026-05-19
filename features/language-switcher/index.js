let currentContext = null;

export default {
  id: 'language-switcher',
  name: 'Language Switcher',
  description: 'Switch the cplace display language via the extension popup.',
  defaultEnabled: false,
  pageScript: true,
  actions: [{ id: 'switch-language', label: 'Switch language', icon: '🌐' }],
  apply(_options = {}, context = null) {
    currentContext = context;
  },
  revert() {
    currentContext = null;
  },
  onVersionDetected(context) {
    currentContext = context;
  },
  onAction(actionId) {
    if (actionId === 'switch-language') {
      document.dispatchEvent(new CustomEvent('cplace:doSwitchLanguage', {
        detail: { baseUrl: currentContext?.baseUrl ?? null },
      }));
    }
  },
};
