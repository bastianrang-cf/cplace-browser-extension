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
    script.textContent = `(function () {
      document.addEventListener('${TRIGGER_EVENT}', function () {
        if (typeof _cplace_languages_ === 'undefined') return;
        var available = _cplace_languages_.sortedIds;
        var chosen = prompt(
          'Change user language to [' + available.join(', ') + ']?',
          _cplace_languages_.default
        );
        if (chosen === null) return;
        if (available.indexOf(chosen) === -1) {
          cplaceUtils.showErrorMessage('Only enter allowed languages. Currently: ' + available.join(', '));
          return;
        }
        var uid = 'person/' + _currentUserId_;
        var paramName = 'locale_' + cplaceUtils.uidToHtmlSafeUid(uid);
        var param = {
          parameterName: paramName,
          parameterNameIdHash: md5_lib.md4(paramName),
          value: chosen,
        };
        var formData = new FormData();
        formData.append('serializedControlStates', JSON.stringify({ [paramName]: param }));
        for (var key in param) formData.append(key, param[key]);
        jQuery.ajax({
          url: _context_ + 'functions/submitFeatureAngular',
          data: formData,
          processData: false,
          contentType: false,
          type: 'POST',
        });
      });
    })();`;
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
