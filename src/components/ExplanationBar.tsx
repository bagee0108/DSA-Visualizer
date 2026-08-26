import type { ReactNode } from 'react';

import type { Frame } from '../core/types';

export interface ExplanationBarProps {
  readonly frame: Frame | null;
}

export function ExplanationBar({ frame }: ExplanationBarProps): ReactNode {
  if (frame === null) {
    return (
      <div className="flex min-h-11 shrink-0 items-center border-t border-line bg-panel px-3 py-2 text-body text-fg-mute">
        No frame to show.
      </div>
    );
  }

  return (
    <div className="flex min-h-11 shrink-0 items-start gap-2 border-t border-line bg-panel px-3 py-2">
      {frame.phase !== undefined && (
        <span className="mt-0.5 shrink-0 rounded-xs bg-raised px-1.5 py-0.5 font-mono text-micro uppercase tracking-wider text-fg-dim">
          {frame.phase}
        </span>
      )}
      <p className="text-body text-fg">{frame.explanation}</p>
    </div>
  );
}
