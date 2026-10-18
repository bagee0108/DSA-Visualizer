import { describe, expect, it } from 'vitest';
import { build, type Rollup } from 'vite';

import { DEFAULT_SITE_ORIGIN, SITE_ORIGIN, siteOriginFrom } from '../site';

/** The old domain, spelled so this file does not contain it. */
const OLD_DOMAIN = ['lowlink', 'dev'].join('.');

/** Every file under src/ and public/, as text; binary files read as mangled text, which still shows an ASCII domain. */
const SOURCES: Record<string, string> = import.meta.glob(['/src/**/*', '/public/**/*'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

function outputsOf(result: Awaited<ReturnType<typeof build>>): Rollup.OutputBundle[number][] {
  const results = Array.isArray(result) ? result : [result];
  return results.flatMap((one) => ('output' in one ? one.output : []));
}

describe('site origin', () => {
  it('defaults to treewidth.dev and accepts only a bare https origin', () => {
    expect(DEFAULT_SITE_ORIGIN).toBe('https://treewidth.dev');
    expect(siteOriginFrom(undefined)).toBe(DEFAULT_SITE_ORIGIN);
    expect(siteOriginFrom('  ')).toBe(DEFAULT_SITE_ORIGIN);
    expect(siteOriginFrom('https://example.org/')).toBe('https://example.org');
    expect(() => siteOriginFrom('http://example.org')).toThrow();
    expect(() => siteOriginFrom('https://example.org/app')).toThrow();
    expect(SITE_ORIGIN).toBe(siteOriginFrom(undefined));
  });

  it(`leaves no ${OLD_DOMAIN} in src/ or public/`, () => {
    const names = Object.keys(SOURCES);
    expect(names.some((name) => name.startsWith('/public/'))).toBe(true);
    expect(names.filter((name) => SOURCES[name]?.includes(OLD_DOMAIN))).toEqual([]);
  });

  // public/ is copied into the output byte for byte, so the test above covers
  // those files; this covers everything the build generates.
  it(`leaves no ${OLD_DOMAIN} in the build output, and puts the origin where it belongs`, async () => {
    const result = await build({ logLevel: 'silent', mode: 'production', build: { write: false, sourcemap: false } });
    const files = outputsOf(result);
    const text = (file: Rollup.OutputBundle[number]): string =>
      file.type === 'chunk' ? file.code : typeof file.source === 'string' ? file.source : new TextDecoder().decode(file.source);
    const byName = new Map(files.map((file) => [file.fileName, text(file)]));

    expect(files.length).toBeGreaterThan(3);
    expect([...byName].filter(([, body]) => body.includes(OLD_DOMAIN)).map(([name]) => name)).toEqual([]);

    const html = byName.get('index.html') ?? '';
    expect(html).toContain(`<meta property="og:url" content="${SITE_ORIGIN}/" />`);
    expect(html).toContain(`<meta property="og:image" content="${SITE_ORIGIN}/og.png" />`);
    expect(html).not.toContain('%SITE_ORIGIN%');
    expect(byName.get('robots.txt')).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
    expect(byName.get('sitemap.xml')).toContain(`<loc>${SITE_ORIGIN}/</loc>`);
  }, 120_000);
});
