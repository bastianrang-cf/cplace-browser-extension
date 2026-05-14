import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'cplace browser extension',
    description: 'Detects cplace pages and offers optional modules for cplace solutions.',
    permissions: ['storage'],
    icons: {
      16: 'icons/color-16.png',
      32: 'icons/color-32.png',
      48: 'icons/color-48.png',
      128: 'icons/color-128.png',
    },
    action: {
      default_title: 'cplace',
      default_icon: {
        16: 'icons/gray-16.png',
        32: 'icons/gray-32.png',
        48: 'icons/gray-48.png',
        128: 'icons/gray-128.png',
      },
    },
  },
});
