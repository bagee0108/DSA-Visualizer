/**
 * Shared by the image scripts (og-image.mjs, favicons.mjs): the active
 * theme's dark-mode tokens, and a screenshot of an HTML page by a local
 * headless Chrome. No dependency beyond Vite, which the project already has.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runnerImport } from 'vite';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The active preset's dark tokens, read from src/theme/themes.ts so nothing is copied by hand. */
export async function darkTokens() {
  const { module } = await runnerImport(join(ROOT, 'src', 'theme', 'themes.ts'), { configFile: false, logLevel: 'silent' });
  return { id: module.ACTIVE_THEME, ...module.deriveTokens(module.PRESETS[module.ACTIVE_THEME], 'dark') };
}

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

/** Renders `html` at width x height into the PNG at `out`, and checks Chrome gave exactly that size. */
export function screenshot(html, out, width, height, background) {
  const work = mkdtempSync(join(tmpdir(), 'lowlink-render-'));
  try {
    const page = join(work, 'page.html');
    writeFileSync(page, html);
    execFileSync(chrome(), [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--user-data-dir=${join(work, 'profile')}`,
      `--window-size=${width},${height}`,
      ...(background === undefined ? [] : [`--default-background-color=${background.slice(1)}ff`]),
      '--virtual-time-budget=3000',
      `--screenshot=${out}`,
      pathToFileURL(page).href,
    ], { stdio: 'ignore' });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  // A PNG's IHDR holds the size at bytes 16-23.
  const png = readFileSync(out);
  const size = [png.readUInt32BE(16), png.readUInt32BE(20)];
  if (size[0] !== width || size[1] !== height) throw new Error(`${out} is ${size.join('x')}, expected ${width}x${height}`);
}
