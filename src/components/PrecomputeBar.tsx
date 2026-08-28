/**
 * Determinate progress while a run is being built. Gated: a build that
 * finishes quickly shows nothing at all, because a bar that flashes for 80ms
 * is worse than no bar.
 */

import { useEffect, useState, type ReactNode } from 'react';

import { usePrefersReducedMotion } from '../hooks/useMotion';
import { usePlayback } from '../playback/PlaybackProvider';

const GATE_MS = 200;

export function PrecomputeBar(): ReactNode {
  const { progress } = usePlayback();
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), GATE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!shown) return null;

  const percent = Math.round(progress * 100);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5" role="status" aria-live="polite">
      <div className="flex w-64 items-baseline justify-between font-mono text-micro text-fg-mute">
        <span>precomputing frames</span>
        <span className="tabular-nums text-fg-dim">{percent}%</span>
      </div>
      <div className="h-1 w-64 overflow-hidden rounded-xs bg-raised">
        <div
          className="h-full bg-accent"
          style={{
            width: `${percent}%`,
            // Information, not decoration: with motion off the fill still
            // moves, it just stops easing between readings.
            transition: reduced ? 'none' : 'width var(--duration-fast) var(--ease-ui)',
          }}
        />
      </div>
    </div>
  );
}
