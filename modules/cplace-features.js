import { defineWxtModule, addPublicAssets } from 'wxt/modules';
import { readdirSync, existsSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export default defineWxtModule({
  name: 'cplace:features',
  setup(wxt) {
    const featuresDir = join(wxt.config.root, 'features');
    const stagingDir = join(wxt.config.wxtDir, 'features-assets');

    wxt.hooks.hook('build:before', () => {
      rmSync(stagingDir, { recursive: true, force: true });
      mkdirSync(stagingDir, { recursive: true });
      for (const d of readdirSync(featuresDir, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        const id = d.name;
        const dir = join(featuresDir, id);
        const page = join(dir, 'page.js');
        if (existsSync(page)) copyFileSync(page, join(stagingDir, `${id}-page.js`));
        const css = join(dir, 'module.css');
        if (existsSync(css)) copyFileSync(css, join(stagingDir, `${id}-module.css`));
        for (const f of readdirSync(dir)) {
          if (/\.(svg|png)$/i.test(f)) {
            copyFileSync(join(dir, f), join(stagingDir, `${id}-${f}`));
          }
        }
      }
    });

    addPublicAssets(wxt, stagingDir);
  },
});
