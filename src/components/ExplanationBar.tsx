import type { ReactNode } from 'react';

import type { Frame } from '../core/types';

export interface ExplanationBarProps {
  readonly frame: Frame | null;
  readonly animate: boolean;
  /** Said instead of "No frame to show." when there is a reason there is no frame. */
  readonly idle?: string | undefined;
}

/** Two lines of body text plus padding and the 1 px top border. Held open so
 *  the panel does not jump between a one-line and a two-line explanation: the
 *  bottom padding gives up the border's pixel so two lines fit in the 3.75rem
 *  exactly. A pixel of jump resized the canvas and re-laid out the whole
 *  drawing on every step that changed the line count. */
const RESERVED = 'min-h-15 pt-2 pb-[calc(0.5rem-1px)]';

export function ExplanationBar({ frame, animate, idle }: ExplanationBarProps): ReactNode {
  if (frame === null) {
    return (
      <div className={`flex ${RESERVED} shrink-0 items-center border-t border-line bg-panel px-3 text-body text-fg-mute`}>
        {idle ?? 'No frame to show.'}
      </div>
    );
  }

  return (
    <div className={`flex ${RESERVED} shrink-0 items-start gap-2 border-t border-line bg-panel px-3`}>
      {frame.phase !== undefined && (
        <span className="mt-0.5 shrink-0 rounded-xs bg-raised px-1.5 py-0.5 font-mono text-micro text-fg-dim">
          {frame.phase.toLowerCase()}
        </span>
      )}
      <p
        key={frame.explanation}
        className="text-body text-fg"
        style={animate ? { animation: 'viz-fade-rise var(--duration-base) var(--ease-enter)' } : undefined}
      >
        {frame.explanation}
      </p>
    </div>
  );
}
