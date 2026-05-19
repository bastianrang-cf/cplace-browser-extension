export default {
  id: 'version-badge',
  name: 'Show system version as badge',
  description: 'Displays the detected cplace version number as a badge on the toolbar icon.',
  defaultEnabled: true,
  apply() {},
  revert() {
    try { browser.runtime.sendMessage({ type: 'cplace:clearBadge' }); } catch (_) {}
  },
  onVersionDetected({ version, instance, tenant }) {
    let title = 'cplace';
    if (version) title += ' ' + version;
    if (instance) {
      title += ' on ' + instance;
      if (tenant) title += '/' + tenant;
    }
    try {
      browser.runtime.sendMessage({
        type: 'cplace:setBadge',
        text: version || '',
        color: version ? '#2563eb' : null,
        title,
      });
    } catch (_) {}
  },
};
