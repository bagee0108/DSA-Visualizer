import type { ReactNode } from 'react';

import type { Frame } from '../core/types';

const PHASE_TONE: Record<string, string> = {
  recursion: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  partition: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  merge: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
};

export interface ExplanationBarProps {
  readonly frame: Frame | null;
}

export function ExplanationBar({ frame }: ExplanationBarProps): ReactNode {
  if (frame === null) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900/60">
        No frame to show.
      </div>
    );
  }

  const phase = frame.phase;
  const tone = phase === undefined ? '' : (PHASE_TONE[phase] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300');

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
      {phase !== undefined && (
        <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${tone}`}>
          {phase}
        </span>
      )}
      <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{frame.explanation}</p>
    </div>
  );
}
