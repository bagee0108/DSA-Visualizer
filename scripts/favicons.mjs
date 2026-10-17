/**
 * Renders the icons from the relax mark in the active theme's dark colours:
 *
 *   public/favicon.svg            the heavier 16px cut, no background
 *   public/apple-touch-icon.png   180x180  } the full mark (src/components/Logo.tsx)
 *   public/icon-192.png           192x192  } at 80% on a ground-coloured square
 *   public/icon-512.png           512x512  }
 *
 * and keeps site.webmanifest's background and theme colours on that ground.
 *
 *   npm run favicons                       write into public/
 *   node scripts/favicons.mjs --out <dir>  write somewhere else, to compare first
 *
 * Re-run it (and npm run og) whenever ACTIVE_THEME or its preset changes,
 * and commit the results.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { darkTokens, ROOT, screenshot } from './render.mjs';

const at = process.argv.indexOf('--out');
const OUT = at === -1 ? join(ROOT, 'public') : resolve(process.argv[at + 1]);
mkdirSync(OUT, { recursive: true });

const { id, ground, fg, accent } = await darkTokens();

// Heavier strokes and a bigger node than the full mark: at 16px the hollow
// node and thin strokes blur away, so the small cut drops the node.
const FAVICON = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 18 L20 32 L6 46" stroke="${fg}" stroke-width="8" fill="none"
    stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M33 42 L50 22" stroke="${fg}" stroke-width="7" stroke-linecap="round"/>
  <circle cx="50" cy="20" r="12" fill="${accent}"/>
</svg>
`;

// The geometry of src/components/Logo.tsx, the hollow node filled with the ground.
const MARK = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <path d="M8 20 L20 32 L8 44" stroke="${fg}" stroke-width="4.5" fill="none"
    stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M33 41 L50 23" stroke="${fg}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="32" cy="43" r="7" fill="${ground}" stroke="${fg}" stroke-width="4"/>
  <circle cx="51" cy="21" r="9" fill="${accent}"/>
</svg>`;

function page(size) {
  return `<!doctype html><html><head><style>
html,body{margin:0;width:${size}px;height:${size}px;background:${ground};overflow:hidden}
svg{display:block;width:80%;height:80%;margin:10%}
</style></head><body>
${MARK}</body></html>`;
}

writeFileSync(join(OUT, 'favicon.svg'), FAVICON);
for (const [name, size] of [['apple-touch-icon', 180], ['icon-192', 192], ['icon-512', 512]]) {
  screenshot(page(size), join(OUT, `${name}.png`), size, size, ground);
}

const manifestPath = join(OUT === join(ROOT, 'public') ? OUT : join(ROOT, 'public'), 'site.webmanifest');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.background_color = ground;
manifest.theme_color = ground;
writeFileSync(join(OUT, 'site.webmanifest'), `${JSON.stringify(manifest, null, 2).replace(/\{\n\s+("src"[^}]*?)\n\s+\}/g, (_, body) => `{ ${body.replace(/\n\s+/g, ' ')} }`)}\n`);

console.log(`wrote favicon.svg, apple-touch-icon.png, icon-192.png, icon-512.png and site.webmanifest (${id}) to ${OUT}`);
