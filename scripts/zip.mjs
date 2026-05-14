#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = resolve(ROOT, 'dist');

const manifest = JSON.parse(await readFile(resolve(ROOT, 'manifest.json'), 'utf8'));
const version = manifest.version;
const outFile = resolve(DIST, `cplace-browser-extension-${version}.zip`);

await mkdir(DIST, { recursive: true });

const zip = new AdmZip();
zip.addLocalFile(resolve(ROOT, 'manifest.json'));
zip.addLocalFolder(resolve(ROOT, 'src'), 'src');
zip.addLocalFolder(resolve(ROOT, 'icons'), 'icons', (entry) => entry.endsWith('.png'));

zip.writeZip(outFile);
console.log(`✓ ${outFile}`);
