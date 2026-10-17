import { useEffect } from 'react';

import { useRouter } from '../router/router';
import { siteUrl } from '../site';

function setLink(rel: string, href: string | null): void {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (href === null) {
    link?.remove();
    return;
  }
  if (link === null) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.append(link);
  }
  link.href = href;
}

function setMeta(property: string, content: string): void {
  document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`)?.setAttribute('content', content);
}

/**
 * Sets the tab title, and the canonical URL (with og:url) for the page on
 * screen. A not-found page passes `canonical: false`: it is not the
 * canonical anything.
 */
export function usePageMeta(title: string, { canonical = true }: { canonical?: boolean } = {}): void {
  const { path } = useRouter();

  useEffect(() => {
    document.title = title;
    const url = canonical ? siteUrl(path) : null;
    setLink('canonical', url);
    setMeta('og:url', url ?? siteUrl('/'));
  }, [title, path, canonical]);
}
