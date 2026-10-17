/**
 * Renders public/og.png, the 1200x630 card that link previews show.
 *
 *   node scripts/og-image.mjs
 *
 * It builds the card as HTML (the relax mark, the "lowlink" wordmark in
 * Martian Mono, the one-line description, Ember dark) and screenshots it
 * with a local headless Chrome, so it needs no dependency. Set CHROME to the
 * browser's path if it is not in a standard place. Run it again after a
 * change to the mark, the fonts or the Ember preset, and commit the PNG.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'og.png');
const WIDTH = 1200;
const HEIGHT = 630;

// Ember, dark mode: PRESETS.ember in src/theme/themes.ts.
const GROUND = '#0f0d0e';
const LINE = '#342c2a';
const FG = '#ece6e3';
const FG_MUTE = '#9a8f8b';
const ACCENT = '#ee5515';

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
@font-face { font-family: "Martian Mono"; font-weight: 100 800; font-stretch: 75% 112.5%; src: url("${font('martian-mono-latin-wdth-wght-normal.woff2')}") format("woff2"); }
@font-face { font-family: "Atkinson Hyperlegible Next"; font-weight: 200 800; src: url("${font('atkinson-hyperlegible-next-latin-wght-normal.woff2')}") format("woff2"); }
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
  <div class="lockup">${MARK}<span class="word">lowlink</span></div>
  <p>${DESCRIPTION}</p>
</body></html>`;

function chrome() {
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  const found = candidates.find((path) => path !== undefined && existsSync(path));
  if (found === undefined) throw new Error('No Chrome found; set CHROME to its path.');
  return found;
}

const work = mkdtempSync(join(tmpdir(), 'lowlink-og-'));
try {
  const page = join(work, 'og.html');
  writeFileSync(page, HTML);
  execFileSync(chrome(), [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--user-data-dir=${join(work, 'profile')}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    '--virtual-time-budget=3000',
    `--screenshot=${OUT}`,
    pathToFileURL(page).href,
  ], { stdio: 'ignore' });
} finally {
  rmSync(work, { recursive: true, force: true });
}

// A PNG's IHDR holds the size at bytes 16-23; check Chrome gave the exact card.
const png = readFileSync(OUT);
const size = [png.readUInt32BE(16), png.readUInt32BE(20)];
if (size[0] !== WIDTH || size[1] !== HEIGHT) throw new Error(`og.png is ${size.join('x')}, expected ${WIDTH}x${HEIGHT}`);
console.log(`wrote public/og.png (${WIDTH}x${HEIGHT}, ${statSync(OUT).size} bytes)`);
