/** Which page a path is. Pure, so a malformed URL can be tested without a DOM. */

export type Route =
  | { readonly page: 'home' }
  | { readonly page: 'browse' }
  | { readonly page: 'about' }
  | { readonly page: 'visualize'; readonly id: string }
  | { readonly page: 'not-found' };

/** decodeURIComponent throws on a broken escape such as `%E0%A4%A`; that is a missing page, not a crash. */
function safeDecode(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

export function resolveRoute(path: string): Route {
  if (path === '/' || path === '') return { page: 'home' };
  if (path === '/browse' || path === '/browse/') return { page: 'browse' };
  if (path === '/about' || path === '/about/') return { page: 'about' };

  const visualize = /^\/visualize\/([^/]+)\/?$/.exec(path);
  if (visualize !== null) {
    const id = safeDecode(visualize[1] ?? '');
    return id === null ? { page: 'not-found' } : { page: 'visualize', id };
  }

  return { page: 'not-found' };
}
