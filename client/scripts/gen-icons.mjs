// Regenerates the PWA icons in public/icons from the SVG below (run: npm run icons -w client).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');
fs.mkdirSync(out, { recursive: true });

// Dumbbell on the app background. `pad` shrinks the glyph for the maskable safe zone.
const svg = (pad, rounded) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#0E1012"/>
  <g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)" fill="#D4FF3A">
    <rect x="96" y="176" width="48" height="160" rx="16"/>
    <rect x="368" y="176" width="48" height="160" rx="16"/>
    <rect x="56" y="212" width="36" height="88" rx="12"/>
    <rect x="420" y="212" width="36" height="88" rx="12"/>
    <rect x="140" y="236" width="232" height="40" rx="12"/>
  </g>
</svg>`;

fs.writeFileSync(path.join(out, 'favicon.svg'), svg(0, true));
await sharp(Buffer.from(svg(0, false))).resize(180, 180).png().toFile(path.join(out, 'apple-touch-icon.png'));
await sharp(Buffer.from(svg(0, true))).resize(192, 192).png().toFile(path.join(out, 'icon-192.png'));
await sharp(Buffer.from(svg(0, true))).resize(512, 512).png().toFile(path.join(out, 'icon-512.png'));
await sharp(Buffer.from(svg(0.25, false))).resize(512, 512).png().toFile(path.join(out, 'icon-maskable-512.png'));
console.log('icons written to', out);
