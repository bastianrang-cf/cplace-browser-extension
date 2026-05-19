import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: ({ mode }) => ({
    name: 'cplace browser extension',
    ...(mode === 'development' && {
      key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwBMYuyODj0qWoNU5/6rIeXlWTQbBu2Box4JyKM5/EzB9BqdyWgGixbgR2SLKr0le4N0iTJKtiNiPgOVUHGEZN7PC0xiZZeIXdtJcHfBXS0aG84dr/lck/8Uzv/xjNpjIfpm8T6nSm3n9MLFXiG3zdQo8FfNDizY122b6dukxfCQFo/8L03RXTQCX8b8rs+QaApuoWTYbXrlmrEEA1f6V98dVP3Ku/+XgehHel66OnUqEjBLi0PS8ZzWhUv/tJmDQLW7JR7RVo4ulqtkklhz1+vy5G2M8E7gZfEdokZ1dDMcFr+Py5uy3eviHsz1GwfZvuc6F8FJVLnj2KcdlODxXBwIDAQAB',
    }),
    description: 'Detects cplace pages and offers optional modules for cplace solutions.',
    permissions: ['storage', 'activeTab'],
    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
    action: {
      default_title: 'cplace',
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
        48: 'icons/icon-48.png',
        128: 'icons/icon-128.png',
      },
    },
    web_accessible_resources: [
      { resources: ['*-page.js', '*-module.css'], matches: ['<all_urls>'] },
    ],
  }),
});
