/**
 * Motion helpers for the chrome. Both respect the reduced-motion setting by
 * landing on the final state immediately rather than by skipping it.
 */

import { useEffect, useRef, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = (): void => setReduced(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * Counts from the value on screen to the new one over `durationMs`, on
 * requestAnimationFrame. Restarting mid-count picks up from where it is, so
 * fast playback rolls continuously instead of stuttering.
 */
export function useCountUp(value: number, durationMs = 120): number {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);

  useEffect(() => {
    if (reduced || durationMs <= 0 || displayRef.current === value) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }

    const from = displayRef.current;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / durationMs);
      const next = t >= 1 ? value : Math.round(from + (value - from) * (1 - (1 - t) ** 3));
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs, reduced]);

  return display;
}
