import { describe, expect, it } from 'vitest';

import '../algorithms';
import { isOpen, LEVELS } from '../core/levels';
import { sitemapPaths, sitemapXml, STATIC_PATHS } from './sitemap';

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

  it('writes absolute https URLs on lowlink.dev, one per path', () => {
    const xml = sitemapXml(paths);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs).toHaveLength(paths.length);
    expect(locs[0]).toBe('https://lowlink.dev/');
    for (const loc of locs) expect(loc).toMatch(/^https:\/\/lowlink\.dev\/[a-z0-9/-]*$/);
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
  });
});
