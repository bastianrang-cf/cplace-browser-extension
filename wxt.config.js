import { defineConfig } from 'wxt';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, copyFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function copyModulePageScripts() {
  return {
    name: 'copy-module-page-scripts',
    writeBundle(options) {
      const outDir = options.dir;
      if (!outDir) return;
      const files = readdirSync(join(__dirname, 'modules'))
        .filter((f) => f.endsWith('-page.js'));
      for (const file of files) {
        copyFileSync(join(__dirname, 'modules', file), join(outDir, file));
      }
    },
  };
}

export default defineConfig({
  modulesDir: '.wxt/user-modules',
  vite: () => ({
    plugins: [copyModulePageScripts()],
  }),
  manifest: {
    name: 'cplace browser extension',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwBMYuyODj0qWoNU5/6rIeXlWTQbBu2Box4JyKM5/EzB9BqdyWgGixbgR2SLKr0le4N0iTJKtiNiPgOVUHGEZN7PC0xiZZeIXdtJcHfBXS0aG84dr/lck/8Uzv/xjNpjIfpm8T6nSm3n9MLFXiG3zdQo8FfNDizY122b6dukxfCQFo/8L03RXTQCX8b8rs+QaApuoWTYbXrlmrEEA1f6V98dVP3Ku/+XgehHel66OnUqEjBLi0PS8ZzWhUv/tJmDQLW7JR7RVo4ulqtkklhz1+vy5G2M8E7gZfEdokZ1dDMcFr+Py5uy3eviHsz1GwfZvuc6F8FJVLnj2KcdlODxXBwIDAQAB',
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
    web_accessible_resources: [
      { resources: ['*-page.js'], matches: ['<all_urls>'] },
    ],
  },
});
