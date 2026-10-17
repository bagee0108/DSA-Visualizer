/**
 * sitemap.xml, generated at build time (see vite.config.ts) from the levels,
 * so it can never list a page that does not exist. A level is listed only
 * once it is open; a "soon" level never is.
 */

import { isOpen, LEVELS } from '../core/levels';
import { siteUrl } from '../site';

/** Pages that are always there, before the levels. */
export const STATIC_PATHS: readonly string[] = ['/', '/browse'];

export function sitemapPaths(): readonly string[] {
  return [...STATIC_PATHS, ...LEVELS.filter(isOpen).map((level) => `/visualize/${level.id}`)];
}

export function sitemapXml(paths: readonly string[] = sitemapPaths()): string {
  const urls = paths.map((path) => `  <url><loc>${siteUrl(path)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
