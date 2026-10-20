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
 *
 * With motion off (or no duration) the value is returned as it is rather than
 * copied into state from an effect: that copy was a second render per step,
 * and fast stepping stacked those past React's nested-update limit.
 */
export function useCountUp(value: number, durationMs = 120): number {
  const reduced = usePrefersReducedMotion();
  const still = reduced || durationMs <= 0;
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);

  useEffect(() => {
    if (still) {
      displayRef.current = value;
      return;
    }

    // Always on the next frame, never synchronously, even when there is nothing to count.
    const from = displayRef.current;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / durationMs);
      const next = t >= 1 ? value : Math.round(from + (value - from) * (1 - (1 - t) ** 3));
      displayRef.current = next;
      setDisplay(next);
      if (t < 1 && next !== value) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs, still]);

  return still ? value : display;
}
