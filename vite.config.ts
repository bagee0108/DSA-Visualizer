import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import './src/algorithms';
import { sitemapXml } from './src/seo/sitemap';
import { ACTIVE_THEME, PRESETS, THEME_STYLE_ID, themeCss } from './src/theme/themes';

/** FNV-1a, 32 bit: enough to tell one theme build from the next. */
function contentHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const THEME_CSS = themeCss(PRESETS[ACTIVE_THEME]);
const THEME_FILE = `assets/theme-${contentHash(THEME_CSS)}.css`;

/**
 * Ships the active theme as its own stylesheet, linked first in <head>, so
 * the first paint is already in the right colours with no flash. A file, not
 * an inline <style>, so the CSP is plain 'self' (see vercel.json). The name
 * carries a content hash, so a theme change is never served stale.
 * src/theme/themes.ts is the only place chrome colours are defined.
 */
function theme(): Plugin {
  return {
    name: 'lowlink-theme',
    transformIndexHtml: () => [
      { tag: 'link', attrs: { rel: 'stylesheet', id: THEME_STYLE_ID, href: `/${THEME_FILE}` }, injectTo: 'head' },
    ],
    configureServer(server) {
      server.middlewares.use(`/${THEME_FILE}`, (_request, response) => {
        response.setHeader('Content-Type', 'text/css');
        response.end(THEME_CSS);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: THEME_FILE, source: THEME_CSS });
    },
  };
}

/** Emits sitemap.xml from the open levels; see src/seo/sitemap.ts. */
function sitemap(): Plugin {
  return {
    name: 'lowlink-sitemap',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml() });
    },
  };
}

export default defineConfig({
  plugins: [theme(), sitemap(), react(), tailwindcss()],
  base: '/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Vitest blanks stylesheets by default; themes.test.ts reads the role
    // palette out of index.css so it can never drift from what ships.
    css: { include: [/index\.css/] },
  },
});
