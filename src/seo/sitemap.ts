/**
 * sitemap.xml and robots.txt, generated at build time (see vite.config.ts) from the levels,
 * so it can never list a page that does not exist. A level is listed only
 * once it is open; a "soon" level never is.
 */

import { isOpen, LEVELS, type Level } from '../core/levels';
import { SITE_ORIGIN, siteUrl } from '../site';

/** Pages that are always there, before the levels. */
export const STATIC_PATHS: readonly string[] = ['/', '/browse', '/about'];

export function sitemapPaths(levels: readonly Level[] = LEVELS, open: (level: Level) => boolean = isOpen): readonly string[] {
  return [...STATIC_PATHS, ...levels.filter(open).map((level) => `/visualize/${level.id}`)];
}

export function sitemapXml(paths: readonly string[] = sitemapPaths(), origin: string = SITE_ORIGIN): string {
  const urls = paths.map((path) => `  <url><loc>${siteUrl(path, origin)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** robots.txt, emitted beside the sitemap so its Sitemap line follows SITE_ORIGIN. */
export function robotsTxt(origin: string = SITE_ORIGIN): string {
  return `User-agent: *\nAllow: /\nSitemap: ${siteUrl('/sitemap.xml', origin)}\n`;
}
