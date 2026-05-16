import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(join(__dirname, '../icons/source.svg'));
const outDir = join(__dirname, '../public/icons');
mkdirSync(outDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  await sharp(svg).resize(size, size).png().toFile(join(outDir, `icon-${size}.png`));
  console.log(`Generated icon-${size}.png`);
}
