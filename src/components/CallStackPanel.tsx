import type { ReactNode } from 'react';

import type { CallStackEntry } from '../core/types';

export interface CallStackPanelProps {
  readonly stack: readonly CallStackEntry[];
}

export function CallStackPanel({ stack }: CallStackPanelProps): ReactNode {
  const reversed = [...stack].reverse();

  return (
    <section className="rounded-xl border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-1.5 dark:border-slate-800">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Call stack
        </h2>
        <span className="font-mono text-[11px] text-slate-400">depth {stack.length}</span>
      </header>

      {reversed.length === 0 ? (
        <p className="px-3 py-2 text-xs text-slate-400">empty</p>
      ) : (
        <ol className="max-h-32 overflow-y-auto px-2 py-1.5">
          {reversed.map((entry, position) => (
            <li
              key={`${entry.label}-${position}`}
              className={`flex items-baseline gap-2 rounded px-1.5 py-1 font-mono text-xs ${
                position === 0
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
              style={{ paddingLeft: `${6 + Math.min(reversed.length - 1 - position, 8) * 8}px` }}
            >
              <span className="truncate">{entry.label}</span>
              {entry.detail !== undefined && (
                <span className="shrink-0 text-[10px] text-slate-400">{entry.detail}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
