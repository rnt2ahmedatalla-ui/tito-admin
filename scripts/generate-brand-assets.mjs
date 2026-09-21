import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public');
const brandDir = join(publicDir, 'brand');

mkdirSync(brandDir, { recursive: true });

// Minimal valid 1x1 PNG (espresso #341A0E)
const ESPRESSO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const GOLD_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const files = {
  'favicon.ico': ESPRESSO_PNG,
  'tito-icon-16.png': ESPRESSO_PNG,
  'tito-icon-32.png': ESPRESSO_PNG,
  'tito-icon-48.png': ESPRESSO_PNG,
  'tito-icon-64.png': ESPRESSO_PNG,
  'tito-icon-128.png': ESPRESSO_PNG,
  'tito-icon-180.png': ESPRESSO_PNG,
  'tito-icon-192.png': ESPRESSO_PNG,
  'tito-icon-256.png': ESPRESSO_PNG,
  'tito-icon-512.png': ESPRESSO_PNG,
  'tito-icon-1024.png': ESPRESSO_PNG,
  'tito-maskable-512.png': ESPRESSO_PNG,
  'tito-icon-mono-white-1024.png': GOLD_PNG,
  'tito-icon-mono-dark-1024.png': ESPRESSO_PNG,
  'tito-icon-gold-on-dark-1024.png': GOLD_PNG,
  'tito-icon-gold-on-dark-512.png': GOLD_PNG,
  'tito-icon-gold-on-dark-192.png': GOLD_PNG,
  'tito-og-image-1200x630.png': ESPRESSO_PNG,
  'brand/tito-logo-horizontal-transparent-1200.png': GOLD_PNG,
  'brand/tito-logo-horizontal-gold-on-dark-1200.png': GOLD_PNG,
  'brand/tito-logo-horizontal-gold-on-dark-2400.png': GOLD_PNG,
  'brand/tito-logo-horizontal-transparent-2400.png': GOLD_PNG,
};

for (const [rel, buf] of Object.entries(files)) {
  const dest = join(publicDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  if (!existsSync(dest)) {
    writeFileSync(dest, buf);
    console.log('Created', rel);
  }
}

console.log('Brand assets ready (placeholder PNGs — replace with real assets from BRAND.md)');
