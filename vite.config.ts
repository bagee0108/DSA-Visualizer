import { defineConfig, type Plugin } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import './src/algorithms';
import { robotsTxt, sitemapXml } from './src/seo/sitemap';
import { siteOriginFrom } from './src/site';
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
    name: 'treewidth-theme',
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

/**
 * Puts the site's origin wherever the site names itself: %SITE_ORIGIN% in
 * index.html (og:url, og:image), and robots.txt and sitemap.xml, emitted
 * from the open levels (see src/seo/sitemap.ts).
 */
function site(origin: string): Plugin {
  return {
    name: 'treewidth-site',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replaceAll('%SITE_ORIGIN%', origin),
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt(origin) });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(undefined, origin) });
    },
  };
}

export default defineConfig(({ mode }) => {
  // SITE_ORIGIN from the environment (or a .env file), else the default in
  // src/site.ts. The app reads it as import.meta.env.SITE_ORIGIN.
  const origin = siteOriginFrom(loadEnv(mode, '.', 'SITE_ORIGIN').SITE_ORIGIN);
  return {
    plugins: [theme(), site(origin), react(), tailwindcss()],
    base: '/',
    define: { 'import.meta.env.SITE_ORIGIN': JSON.stringify(origin) },
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
  };
});
