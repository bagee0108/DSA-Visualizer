import { useEffect } from 'react';

/** Sets the tab title for the page on screen. */
export function usePageMeta(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
