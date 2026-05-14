#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ICONS_DIR = resolve(ROOT, 'icons');
const SOURCE = resolve(ICONS_DIR, 'source.svg');
const SIZES = [16, 32, 48, 128];

const svg = await readFile(SOURCE);
await mkdir(ICONS_DIR, { recursive: true });

for (const size of SIZES) {
  const colorBuf = await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await writeFile(resolve(ICONS_DIR, `color-${size}.png`), colorBuf);

  const grayBuf = await sharp(colorBuf).grayscale().png().toBuffer();
  await writeFile(resolve(ICONS_DIR, `gray-${size}.png`), grayBuf);

  console.log(`✓ color-${size}.png  gray-${size}.png`);
}
