#!/usr/bin/env node
/**
 * Generates the home-screen icons from the brand logo.
 *
 *   node scripts/generate-pwa-icons.mjs
 *
 *   public/icons/icon-192.png          PWA icon (transparent, circular crop)
 *   public/icons/icon-512.png          PWA icon
 *   public/icons/icon-maskable-512.png Android adaptive icon: logo on a rose field, sized to
 *                                      sit inside the 80% safe zone so no shape clips it
 *   app/apple-icon.png                 iOS home-screen icon (Next.js serves it automatically)
 *
 * The logo is a circular badge on a white square, so every icon is circularly masked —
 * otherwise the white corners would show as a square on coloured home screens.
 */
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(ROOT, 'public/media/logo.jpg');
const ROSE = { r: 0xd5, g: 0x41, b: 0x67, alpha: 1 };

const circleMask = (size) =>
  Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
       <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/>
     </svg>`
  );

/** Square icon with a transparent background outside the logo's own circle. */
async function circularIcon(size, outPath) {
  const mask = circleMask(size);
  await sharp(SOURCE)
    .resize(size, size, { fit: 'cover' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

async function maskableIcon(size, outPath) {
  const inner = Math.round(size * 0.72);
  const mask = circleMask(inner);

  const logo = await sharp(SOURCE)
    .resize(inner, inner, { fit: 'cover' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  await sharp({ create: { width: size, height: size, channels: 4, background: ROSE } })
    .composite([{ input: logo, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

async function main() {
  mkdirSync(resolve(ROOT, 'public/icons'), { recursive: true });

  await circularIcon(192, resolve(ROOT, 'public/icons/icon-192.png'));
  await circularIcon(512, resolve(ROOT, 'public/icons/icon-512.png'));
  await maskableIcon(512, resolve(ROOT, 'public/icons/icon-maskable-512.png'));
  await circularIcon(180, resolve(ROOT, 'app/apple-icon.png'));

  console.log('✔ icons written:');
  for (const file of [
    'public/icons/icon-192.png',
    'public/icons/icon-512.png',
    'public/icons/icon-maskable-512.png',
    'app/apple-icon.png',
  ]) {
    console.log(`   ${file}`);
  }
}

main().catch((error) => {
  console.error('Icon generation failed:', error);
  process.exit(1);
});
