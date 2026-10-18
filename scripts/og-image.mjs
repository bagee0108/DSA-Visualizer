/**
 * Renders public/og.png, the 1200x630 card that link previews show.
 *
 *   npm run og                              write public/og.png
 *   node scripts/og-image.mjs --out <dir>   write somewhere else, to compare first
 *
 * It builds the card as HTML (the relax mark, the "treewidth" wordmark in
 * Martian Mono, the one-line description, in the active theme's dark
 * colours) and screenshots it with a local headless Chrome; see render.mjs.
 * Set CHROME to the browser's path if it is not in a standard place. Re-run
 * it after a change to the mark, the fonts or the active theme, and commit
 * the PNG.
 */

import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { darkTokens, ROOT, screenshot } from './render.mjs';

const at = process.argv.indexOf('--out');
const DIR = at === -1 ? join(ROOT, 'public') : resolve(process.argv[at + 1]);
mkdirSync(DIR, { recursive: true });
const OUT = join(DIR, 'og.png');
const WIDTH = 1200;
const HEIGHT = 630;

const { ground: GROUND, line: LINE, fg: FG, fgMute: FG_MUTE, accent: ACCENT } = await darkTokens();

const DESCRIPTION = 'Learn data structures and algorithms by watching them run.';

function font(file) {
  return `data:font/woff2;base64,${readFileSync(join(ROOT, 'public', 'fonts', file)).toString('base64')}`;
}

// The geometry of src/components/Logo.tsx, coloured for the dark ground.
const MARK = `
<svg viewBox="0 0 64 64" width="168" height="168" aria-hidden="true">
  <path d="M8 20 L20 32 L8 44" stroke="${FG}" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M33 41 L50 23" stroke="${FG}" stroke-width="4" stroke-linecap="round"/>
  <circle cx="32" cy="43" r="7" fill="${GROUND}" stroke="${FG}" stroke-width="4"/>
  <circle cx="51" cy="21" r="9" fill="${ACCENT}"/>
</svg>`;

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>
@font-face { font-family: "Martian Mono"; font-weight: 100 800; font-stretch: 75% 112.5%; src: url("${font('martian-mono/martian-mono-latin-wdth-wght-normal.woff2')}") format("woff2"); }
@font-face { font-family: "Atkinson Hyperlegible Next"; font-weight: 200 800; src: url("${font('atkinson-hyperlegible-next/atkinson-hyperlegible-next-latin-wght-normal.woff2')}") format("woff2"); }
html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: ${GROUND}; }
body {
  box-sizing: border-box; padding: 0 96px; display: flex; flex-direction: column; justify-content: center; gap: 40px;
  background-image: linear-gradient(${LINE} 1px, transparent 1px), linear-gradient(90deg, ${LINE} 1px, transparent 1px);
  background-size: 48px 48px; background-position: -1px -1px;
}
body::after { content: ""; position: fixed; inset: 0; background: radial-gradient(ellipse at 30% 50%, ${GROUND}00 0%, ${GROUND}e6 70%); }
.lockup, p { position: relative; z-index: 1; }
.lockup { display: flex; align-items: center; gap: 36px; }
.word { font-family: "Martian Mono"; font-weight: 600; font-stretch: 87.5%; font-size: 120px; letter-spacing: -0.02em; color: ${FG}; line-height: 1; }
p { margin: 0; max-width: 900px; font-family: "Atkinson Hyperlegible Next"; font-weight: 500; font-size: 44px; line-height: 1.25; color: ${FG_MUTE}; }
</style></head>
<body>
  <div class="lockup">${MARK}<span class="word">treewidth</span></div>
  <p>${DESCRIPTION}</p>
</body></html>`;

screenshot(HTML, OUT, WIDTH, HEIGHT);
console.log(`wrote ${OUT} (${WIDTH}x${HEIGHT}, ${statSync(OUT).size} bytes)`);
