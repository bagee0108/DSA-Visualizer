/** Where the site lives unless SITE_ORIGIN says otherwise. */
export const DEFAULT_SITE_ORIGIN = 'https://treewidth.dev';

/**
 * The origin from the SITE_ORIGIN environment variable at build time, or the
 * default. vite.config.ts reads the variable once and defines it for the app,
 * so the domain is written nowhere but here.
 */
export function siteOriginFrom(value: string | undefined): string {
  const raw = value === undefined || value.trim() === '' ? DEFAULT_SITE_ORIGIN : value.trim();
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error(`SITE_ORIGIN must be a bare https origin like ${DEFAULT_SITE_ORIGIN}, not ${raw}`);
  }
  return url.origin;
}

/**
 * Where the site lives. Canonical links, og:url, og:image, robots.txt and
 * the sitemap are built from it. Vite defines import.meta.env.SITE_ORIGIN
 * (see vite.config.ts); when the config itself loads this file there is no
 * import.meta.env, so the config passes its origin in explicitly.
 */
export const SITE_ORIGIN: string =
  typeof import.meta.env === 'undefined' ? DEFAULT_SITE_ORIGIN : siteOriginFrom(import.meta.env.SITE_ORIGIN);

/** An absolute URL on the site for a path; drops a trailing slash so each page has one spelling. */
export function siteUrl(path: string, origin: string = SITE_ORIGIN): string {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : '/';
  return `${origin}${clean.startsWith('/') ? clean : `/${clean}`}`;
}
