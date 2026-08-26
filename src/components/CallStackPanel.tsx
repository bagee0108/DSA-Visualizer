import type { ReactNode } from 'react';

import type { CallStackEntry } from '../core/types';

export interface CallStackPanelProps {
  readonly stack: readonly CallStackEntry[];
}

export function CallStackPanel({ stack }: CallStackPanelProps): ReactNode {
  const reversed = [...stack].reverse();

  return (
    <section className="shrink-0 border-t border-line">
      <header className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <h2 className="font-mono text-micro uppercase tracking-wider text-fg-mute">Call stack</h2>
        <span className="font-mono text-micro tabular-nums text-fg-mute">depth {stack.length}</span>
      </header>

      {reversed.length === 0 ? (
        <p className="px-3 py-1.5 font-mono text-micro text-fg-mute">empty</p>
      ) : (
        <ol className="max-h-32 overflow-y-auto px-2 py-1">
          {reversed.map((entry, position) => (
            <li
              key={`${entry.label}-${position}`}
              className={`flex items-baseline gap-2 rounded-xs px-1.5 py-0.5 font-mono text-meta ${
                position === 0 ? 'bg-raised text-fg' : 'text-fg-dim'
              }`}
              style={{ paddingLeft: `${6 + Math.min(reversed.length - 1 - position, 8) * 8}px` }}
            >
              <span className="truncate">{entry.label}</span>
              {entry.detail !== undefined && (
                <span className="shrink-0 text-micro text-fg-mute">{entry.detail}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
