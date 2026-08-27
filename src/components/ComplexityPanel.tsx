/** Big-O next to what actually happened. */

import type { ReactNode } from 'react';

import { useCountUp } from '../hooks/useMotion';
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
    <div className="rounded-xs bg-raised px-2 py-1">
      <dt className="truncate text-micro uppercase tracking-wider text-fg-mute" title={label}>
        {label}
      </dt>
      <dd className="font-mono text-ui tabular-nums text-fg">{value}</dd>
    </div>
  );
}

/** Counts roll to their new value instead of snapping; figures are tabular so
 *  nothing shifts while they do. */
function CountStat({ label, value }: { label: string; value: number }): ReactNode {
  return <Stat label={label} value={useCountUp(value).toLocaleString()} />;
}

const TAG = 'rounded-xs border border-line px-1.5 py-0.5 font-mono text-micro text-fg-dim';

export function ComplexityPanel({ meta, counters }: ComplexityPanelProps): ReactNode {
  const { time, space, notes } = meta.complexity;
  const extras = Object.entries(counters.extra);

  return (
    <section className="shrink-0 border-t border-line">
      <header className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <h2 className="font-mono text-micro uppercase tracking-wider text-fg-mute">Complexity</h2>
        <div className="flex gap-1">
          {meta.inPlace === true && <span className={TAG}>in place</span>}
          {meta.stable !== undefined && <span className={TAG}>{meta.stable ? 'stable' : 'unstable'}</span>}
        </div>
      </header>

      <div className="space-y-2 px-3 py-2">
        <dl className="grid grid-cols-4 gap-1">
          <Stat label="Best" value={time.best} />
          <Stat label="Average" value={time.average} />
          <Stat label="Worst" value={time.worst} />
          <Stat label="Space" value={space} />
        </dl>

        <div>
          <h3 className="mb-1 text-micro uppercase tracking-wider text-fg-mute">This run</h3>
          <dl className="grid grid-cols-2 gap-1">
            {meta.trackedCounters.map((key) => (
              <CountStat key={key} label={COUNTER_LABEL[key]} value={counterValue(key, counters)} />
            ))}
            {extras.map(([key, value]) => (
              <CountStat key={key} label={key} value={value} />
            ))}
          </dl>
        </div>

        {notes !== undefined && notes.length > 0 && (
          <ul className="space-y-1 border-t border-line pt-2">
            {notes.map((note) => (
              <li key={note} className="flex gap-1.5 text-micro leading-snug text-fg-dim">
                <span className="text-fg-mute">-</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
