/** Layout measurements for the resizable panels: an element's size, and a media query. */

import { useEffect, useState, type RefObject } from 'react';

export interface ElementSize {
  readonly width: number;
  readonly height: number;
}

const NONE: ElementSize = { width: 0, height: 0 };

/**
 * The element's border-box size, updated at most once per animation frame
 * however fast it is being resized. Zero until it has been laid out.
 */
export function useElementSize(ref: RefObject<HTMLElement | null>, active = true): ElementSize {
  const [size, setSize] = useState<ElementSize>(NONE);

  useEffect(() => {
    const node = ref.current;
    if (!active || node === null) {
      setSize(NONE);
      return;
    }
    let frame = 0;
    const measure = (): void => {
      frame = 0;
      const width = Math.round(node.offsetWidth);
      const height = Math.round(node.offsetHeight);
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    };
    const observer = new ResizeObserver(() => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    });
    observer.observe(node);
    measure();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ref, active]);

  return size;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = (): void => setMatches(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
