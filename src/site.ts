/** Where Lowlink lives. Canonical links, og:url and the sitemap are built from it. */
export const SITE_ORIGIN = 'https://lowlink.dev';

/** An absolute URL on the site for a path; drops a trailing slash so each page has one spelling. */
export function siteUrl(path: string): string {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : '/';
  return `${SITE_ORIGIN}${clean.startsWith('/') ? clean : `/${clean}`}`;
}
