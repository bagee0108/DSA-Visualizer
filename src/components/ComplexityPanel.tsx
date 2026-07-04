/** Big-O next to what actually happened. */

import type { ReactNode } from 'react';

import type { AlgorithmMeta, CounterKey } from '../core/define';
import type { Counters } from '../core/types';

export interface ComplexityPanelProps {
  readonly meta: AlgorithmMeta;
  readonly counters: Counters;
}

const COUNTER_LABEL: Record<CounterKey, string> = {
  comparisons: 'Comparisons',
  swaps: 'Swaps',
  reads: 'Reads',
  writes: 'Writes',
  accesses: 'Array accesses',
  recursiveCalls: 'Recursive calls',
};

function counterValue(key: CounterKey, counters: Counters): number {
  switch (key) {
    case 'accesses':
      return counters.reads + counters.writes;
    case 'comparisons':
      return counters.comparisons;
    case 'swaps':
      return counters.swaps;
    case 'reads':
      return counters.reads;
    case 'writes':
      return counters.writes;
    case 'recursiveCalls':
      return counters.recursiveCalls;
  }
}

function Stat({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="rounded-lg bg-slate-100 px-2 py-1.5 dark:bg-slate-800/60">
      <dt className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="font-mono text-sm tabular-nums text-slate-800 dark:text-slate-100">{value}</dd>
    </div>
  );
}

export function ComplexityPanel({ meta, counters }: ComplexityPanelProps): ReactNode {
  const { time, space, notes } = meta.complexity;
  const extras = Object.entries(counters.extra);

  return (
    <section className="rounded-xl border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-1.5 dark:border-slate-800">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Complexity
        </h2>
        <div className="flex gap-1">
          {meta.inPlace === true && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              in place
            </span>
          )}
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              meta.stable === true
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {meta.stable === true ? 'stable' : 'unstable'}
          </span>
        </div>
      </header>

      <div className="space-y-2.5 px-3 py-2.5">
        <dl className="grid grid-cols-4 gap-1.5">
          <Stat label="Best" value={time.best} />
          <Stat label="Average" value={time.average} />
          <Stat label="Worst" value={time.worst} />
          <Stat label="Space" value={space} />
        </dl>

        <div>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            This run
          </h3>
          <dl className="grid grid-cols-2 gap-1.5">
            {meta.trackedCounters.map((key) => (
              <Stat
                key={key}
                label={COUNTER_LABEL[key]}
                value={counterValue(key, counters).toLocaleString()}
              />
            ))}
            {extras.map(([key, value]) => (
              <Stat key={key} label={key} value={value.toLocaleString()} />
            ))}
          </dl>
        </div>

        {notes !== undefined && notes.length > 0 && (
          <ul className="space-y-1 border-t border-slate-200 pt-2 dark:border-slate-800">
            {notes.map((note) => (
              <li key={note} className="flex gap-1.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                <span className="text-slate-300 dark:text-slate-600">-</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
