import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import './src/algorithms';
import { sitemapXml } from './src/seo/sitemap';
import { ACTIVE_THEME, PRESETS, THEME_STYLE_ID, themeCss } from './src/theme/themes';

/**
 * Writes the active theme into index.html as a <style> in <head>,
 * so the first paint is already in the right colours with no script and no
 * flash. src/theme/themes.ts is the only place chrome colours are defined.
 */
function theme(): Plugin {
  return {
    name: 'dsa-theme',
    transformIndexHtml: () => [
      { tag: 'style', attrs: { id: THEME_STYLE_ID }, children: themeCss(PRESETS[ACTIVE_THEME]), injectTo: 'head' },
    ],
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
