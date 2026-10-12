/**
 * The marks a level carries wherever it appears: its difficulty, and a slot
 * for progress. Progress does not exist yet, so the slot is drawn in its empty
 * state and says so. It fills in later without a layout change.
 */

import type { ReactNode } from 'react';

import { TIER_LABEL, type Tier } from '../core/levels';

/** The logo's three rising bars; how many are filled is the difficulty. */
export function TierGlyph({ tier, className }: { tier: Tier; className?: string }): ReactNode {
  return (
    <svg viewBox="0 0 11 10" className={`h-2.5 w-[11px] shrink-0 ${className ?? ''}`} aria-hidden="true">
      {[0, 1, 2].map((bar) => (
        <rect
          key={bar}
          x={bar * 4}
          y={10 - (bar + 1) * 3 - 1}
          width="3"
          height={(bar + 1) * 3 + 1}
          rx="0.75"
          className={bar < tier ? 'fill-fg-dim' : 'fill-edge'}
        />
      ))}
    </svg>
  );
}

export function TierLabel({ tier, className }: { tier: Tier; className?: string }): ReactNode {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <TierGlyph tier={tier} />
      {TIER_LABEL[tier]}
    </span>
  );
}

const STAR = 'M6 1.2l1.4 3 3.2.3-2.4 2.2.7 3.2L6 8.3 3.1 9.9l.7-3.2L1.4 4.5l3.2-.3z';

/** Three outline stars. Never filled until there is real progress to show. */
export function ProgressStars({ withLabel = false, className }: { withLabel?: boolean; className?: string }): ReactNode {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`} aria-label="Progress: not started">
      <span className="inline-flex gap-px text-edge" aria-hidden="true">
        {[0, 1, 2].map((star) => (
          <svg key={star} viewBox="0 0 12 12" className="h-3 w-3">
            <path d={STAR} fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        ))}
      </span>
      {withLabel && <span aria-hidden="true">not started</span>}
    </span>
  );
}
