import { defineConfig } from 'wxt';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import { readdirSync, copyFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function copyModuleAssets() {
  return {
    name: 'copy-module-assets',
    writeBundle(options) {
      const outDir = options.dir;
      if (!outDir) return;
      const modulesDir = join(__dirname, 'modules');
      for (const entry of readdirSync(modulesDir)) {
        const pageScript = join(modulesDir, entry, 'page.js');
        if (existsSync(pageScript)) {
          copyFileSync(pageScript, join(outDir, `${entry}-page.js`));
        }
        const moduleCss = join(modulesDir, entry, 'module.css');
        if (existsSync(moduleCss)) {
          copyFileSync(moduleCss, join(outDir, `${entry}-module.css`));
        }
      }
    },
  };
}

export default defineConfig({
  modulesDir: '.wxt/user-modules',
  vite: () => ({
    plugins: [copyModuleAssets()],
  }),
  manifest: {
    name: 'cplace browser extension',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwBMYuyODj0qWoNU5/6rIeXlWTQbBu2Box4JyKM5/EzB9BqdyWgGixbgR2SLKr0le4N0iTJKtiNiPgOVUHGEZN7PC0xiZZeIXdtJcHfBXS0aG84dr/lck/8Uzv/xjNpjIfpm8T6nSm3n9MLFXiG3zdQo8FfNDizY122b6dukxfCQFo/8L03RXTQCX8b8rs+QaApuoWTYbXrlmrEEA1f6V98dVP3Ku/+XgehHel66OnUqEjBLi0PS8ZzWhUv/tJmDQLW7JR7RVo4ulqtkklhz1+vy5G2M8E7gZfEdokZ1dDMcFr+Py5uy3eviHsz1GwfZvuc6F8FJVLnj2KcdlODxXBwIDAQAB',
    description: 'Detects cplace pages and offers optional modules for cplace solutions.',
    permissions: ['storage'],
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
  },
});
