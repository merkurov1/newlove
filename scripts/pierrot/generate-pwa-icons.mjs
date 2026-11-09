#!/usr/bin/env node
/* eslint-env node */
/**
 * Build the Pierrot PWA icons from the existing avatar.
 *
 * Source of truth: public/pierrot/pierrot-avatar-512.jpg (512x512)
 * Output: public/pierrot/icons/*.png
 *
 * The 512px icon is also used as the maskable variant: the face already sits
 * inside Android's central safe zone, and the dark vignette blends into the
 * system mask without a visible artificial frame. The avatar itself is not
 * redrawn or stylised.
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const source = path.join(root, 'public/pierrot/pierrot-avatar-512.jpg');
const outDir = path.join(root, 'public/pierrot/icons');

if (!fs.existsSync(source)) {
  console.error(`Missing avatar source: ${source}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const outputs = [
  ['favicon-16.png', 16],
  ['favicon-32.png', 32],
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
];

for (const [name, size] of outputs) {
  await sharp(source)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, name));
  console.log(`${name}: ${size}x${size}`);
}

// The same 512px artwork is safe for the Android maskable safe zone.
console.log('icon-512.png is reused for purpose="maskable"');
