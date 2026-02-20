#!/usr/bin/env node
/**
 * Build script: zips extension files for Chrome Web Store / Firefox Add-ons publishing.
 * Source files live in src/. Output: copy-that-{version}.zip
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const srcDir = path.join(process.cwd(), 'src');
const rootImages = path.join(process.cwd(), 'images');
const srcImages = path.join(srcDir, 'images');
const iconFiles = ['icon16.png', 'icon48.png', 'icon128.png'];

// Ensure src/images exists for packaging (copy from root if present)
if (!fs.existsSync(srcImages) && fs.existsSync(rootImages)) {
  fs.mkdirSync(srcImages, { recursive: true });
  for (const icon of iconFiles) {
    const from = path.join(rootImages, icon);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(srcImages, icon));
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf8'));
const version = manifest.version;
const outputName = `copy-that-${version}.zip`;
const outputPath = path.join(process.cwd(), outputName);

const coreFiles = [
  'manifest.json',
  'background.js',
  'content.js',
  'mathml-to-omml.js',
  'popup.html',
  'popup.css',
  'popup.js',
];

const output = fs.createWriteStream(outputPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Created ${outputName} (${(archive.pointer() / 1024).toFixed(1)} KB)`);
});

archive.on('error', (err) => {
  console.error('Archive error:', err);
  process.exit(1);
});

archive.pipe(output);

for (const file of coreFiles) {
  const fullPath = path.join(srcDir, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`Error: src/${file} not found`);
    process.exit(1);
  }
  archive.file(fullPath, { name: file });
}

// Icons: prefer src/images, fallback to project root images/
const imagesDir = fs.existsSync(path.join(srcDir, 'images'))
  ? path.join(srcDir, 'images')
  : path.join(process.cwd(), 'images');
for (const icon of iconFiles) {
  const fullPath = path.join(imagesDir, icon);
  if (fs.existsSync(fullPath)) {
    archive.file(fullPath, { name: path.join('images', icon) });
  } else {
    console.warn(`Warning: images/${icon} not found (required by manifest).`);
  }
}

archive.finalize();
