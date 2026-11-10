// Generates the app icon set from one SVG design:
//   build/icon.svg, build/icon.png (512), build/icon.ico (16–256, PNG-embedded) – Electron/NSIS
//   public/favicon.svg, public/favicon.ico, public/pwa-192.png, public/pwa-512.png,
//   public/maskable-512.png, public/apple-touch-icon.png                          – PWA / web
// Usage: node scripts/make-icons.mjs   (needs Playwright's Chromium; re-run only when the design changes)
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {object} o
 * @param {boolean} o.rounded  rounded-square tile (false = full-bleed square, for maskable/apple icons)
 * @param {number} o.scale     glyph scale (maskable icons keep the glyph inside the 80% safe zone)
 */
function svg({ rounded = true, scale = 1 } = {}) {
  const t = 256 * (1 - scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#F26A4B"/>
      <stop offset="1" stop-color="#B3261C"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".18"/>
      <stop offset=".5" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#bg)"/>
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="url(#shine)"/>
  <g transform="translate(${t} ${t}) scale(${scale})">
    <path d="M330 168c-8-40 14-74 52-84" fill="none" stroke="#DDF5C8" stroke-width="26" stroke-linecap="round"/>
    <path d="M296 176c22-24 62-24 82 2-6 10-18 16-30 14" fill="#DDF5C8"/>
    <path d="M318 170c-76-8-136 46-150 132-10 58-40 96-84 118 70 22 158 2 216-62 52-58 76-118 62-164-6-16-24-24-44-24z" fill="#fff"/>
    <path d="M206 296c8-50 40-84 84-94" fill="none" stroke="#F26A4B" stroke-opacity=".28" stroke-width="18" stroke-linecap="round"/>
  </g>
</svg>`;
}

/** ICO container with PNG-compressed images (supported since Windows Vista). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

function findChromium() {
  if (process.env.PW_CHROMIUM_PATH) return process.env.PW_CHROMIUM_PATH;
  const dir = '/opt/pw-browsers';
  if (!existsSync(dir)) return undefined;
  for (const d of readdirSync(dir).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    const exe = join(dir, d, 'chrome-linux64', 'chrome');
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

const browser = await chromium.launch({ executablePath: findChromium() });
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function render(source, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}" width="${size}" height="${size}" style="display:block"></body></html>`,
  );
  await page.waitForFunction(() => document.images[0]?.complete);
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

const out = (rel, data) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
  console.log('wrote', rel);
};

const tile = svg();
const full = svg({ rounded: false, scale: 0.78 });
const apple = svg({ rounded: false, scale: 0.9 });

out('build/icon.svg', tile);
out('public/favicon.svg', tile);
out('build/icon.png', await render(tile, 512));
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoImages = [];
for (const size of icoSizes) icoImages.push({ size, png: await render(tile, size) });
out('build/icon.ico', ico(icoImages));
out('public/favicon.ico', ico(icoImages.filter((i) => i.size <= 48)));
out('public/pwa-192.png', await render(tile, 192));
out('public/pwa-512.png', await render(tile, 512));
out('public/maskable-512.png', await render(full, 512));
out('public/apple-touch-icon.png', await render(apple, 180));

await browser.close();
