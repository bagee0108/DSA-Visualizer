import { describe, expect, it } from 'vitest';

import '../algorithms';
import { isOpen, LEVELS } from '../core/levels';
import { SITE_ORIGIN } from '../site';
import { robotsTxt, sitemapPaths, sitemapXml, STATIC_PATHS } from './sitemap';

describe('sitemap', () => {
  const paths = sitemapPaths();

  it('lists the static pages and exactly the open levels, in path order', () => {
    const open = LEVELS.filter(isOpen).map((level) => `/visualize/${level.id}`);
    expect(open.length).toBeGreaterThan(0);
    expect(paths).toEqual([...STATIC_PATHS, ...open]);
  });

  it('never lists a level that is still coming', () => {
    const soon = LEVELS.filter((level) => !isOpen(level));
    expect(soon.length).toBeGreaterThan(0);
    for (const level of soon) expect(paths).not.toContain(`/visualize/${level.id}`);
  });

  it('writes absolute https URLs on the site origin, one per path', () => {
    const xml = sitemapXml(paths);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? '');
    expect(locs).toHaveLength(paths.length);
    expect(locs[0]).toBe(`${SITE_ORIGIN}/`);
    for (const loc of locs) {
      expect(loc.startsWith(SITE_ORIGIN)).toBe(true);
      expect(loc.slice(SITE_ORIGIN.length)).toMatch(/^\/[a-z0-9/-]*$/);
    }
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
  });

  it('builds robots.txt and the sitemap from whichever origin it is given', () => {
    expect(robotsTxt()).toBe(`User-agent: *\nAllow: /\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);
    expect(robotsTxt('https://example.org')).toContain('Sitemap: https://example.org/sitemap.xml');
    expect(sitemapXml(['/', '/about'], 'https://example.org')).toContain('<loc>https://example.org/about</loc>');
  });
});
