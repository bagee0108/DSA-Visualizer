import type { ReactNode } from 'react';

/** Fill classes for the hollow node, so it matches whatever surface the mark sits on. */
const SURFACE_FILL = {
  ground: 'fill-ground',
  panel: 'fill-panel',
  raised: 'fill-raised',
} as const;

/**
 * The "relax" mark: a terminal caret feeding a graph edge with a lit accent
 * node. Geometry is final; colours come from theme tokens so the mark
 * re-themes with the app. For 32px and up - the favicon in public/ is the
 * heavier 16px cut, baked to static colours.
 */
export function Logo({
  className,
  surface = 'ground',
}: {
  className?: string;
  /** The surface behind the mark. The hollow node is filled with it so it reads as hollow. */
  surface?: keyof typeof SURFACE_FILL;
}): ReactNode {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="DSA Visualizer" className={className}>
      <path
        d="M8 20 L20 32 L8 44"
        className="stroke-fg"
        strokeWidth="4.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M33 41 L50 23" className="stroke-fg" strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="43" r="7" className={`${SURFACE_FILL[surface]} stroke-fg`} strokeWidth="4" />
      <circle cx="51" cy="21" r="9" className="fill-accent" />
    </svg>
  );
}
