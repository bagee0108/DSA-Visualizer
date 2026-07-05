/** The index: every algorithm on the roadmap, grouped by category, searchable. */

import { useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  CATALOG,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  PHASE_LABEL,
  searchCatalog,
  type CatalogEntry,
  type Phase,
} from '../catalog';
import { isRegistered } from '../core/registry';
import type { Category } from '../core/define';
import { Link } from '../router/router';

const PHASES: readonly Phase[] = [1, 2, 3, 4];

const PHASE_TONE: Record<Phase, string> = {
  1: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  2: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  3: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  4: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
};

function AlgorithmCard({ entry }: { entry: CatalogEntry }): ReactNode {
  const ready = isRegistered(entry.id);

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <h3
          className={`text-sm font-medium ${
            ready ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {entry.name}
        </h3>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${PHASE_TONE[entry.phase]}`}
          title={PHASE_LABEL[entry.phase]}
        >
          P{entry.phase}
        </span>
      </div>
      <p className="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">{entry.blurb}</p>
      {!ready && <p className="mt-1.5 text-[10px] uppercase tracking-wide text-slate-400">planned</p>}
    </>
  );

  if (!ready) {
    return (
      <div className="cursor-not-allowed rounded-xl border border-dashed border-slate-200 bg-white/40 p-3 opacity-70 dark:border-slate-800 dark:bg-slate-900/30">
        {body}
      </div>
    );
  }

  return (
    <Link
      to={`/visualize/${entry.id}`}
      className="group rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-indigo-400 hover:bg-indigo-50/50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-indigo-500 dark:hover:bg-indigo-500/5"
    >
      {body}
      <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-indigo-500 opacity-0 transition-opacity group-hover:opacity-100">
        visualize
      </p>
    </Link>
  );
}

export function HomePage(): ReactNode {
  const [query, setQuery] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<Phase | null>(null);

  useEffect(() => {
    document.title = 'DSA Visualizer';
  }, []);

  const readyCount = useMemo(() => CATALOG.filter((entry) => isRegistered(entry.id)).length, []);

  const grouped = useMemo(() => {
    const byPhase = phaseFilter === null ? CATALOG : CATALOG.filter((entry) => entry.phase === phaseFilter);
    const matches = searchCatalog(byPhase, query);

    const groups: Array<{ category: Category; entries: CatalogEntry[] }> = [];
    for (const category of CATEGORY_ORDER) {
      const entries = matches.filter((entry) => entry.category === category);
      if (entries.length > 0) groups.push({ category, entries });
    }
    return groups;
  }, [phaseFilter, query]);

  const total = grouped.reduce((sum, group) => sum + group.entries.length, 0);

  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto px-4 py-5">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Data structures &amp; algorithms, frame by frame
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Every run is stepped, scrubbed and counted. {readyCount} of {CATALOG.length} implemented.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search algorithms, techniques, tags..."
          className="min-w-[15rem] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          aria-label="Search algorithms"
        />
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setPhaseFilter(null)}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              phaseFilter === null
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            All
          </button>
          {PHASES.map((phase) => (
            <button
              key={phase}
              type="button"
              onClick={() => setPhaseFilter(phase === phaseFilter ? null : phase)}
              title={PHASE_LABEL[phase]}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                phaseFilter === phase
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              P{phase}
            </button>
          ))}
        </div>
      </div>

      {total === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-800">
          Nothing matches &quot;{query}&quot;.
        </p>
      ) : (
        <div className="space-y-5 pb-8">
          {grouped.map((group) => (
            <section key={group.category}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {CATEGORY_LABEL[group.category]}
                <span className="ml-1.5 font-normal text-slate-300 dark:text-slate-600">
                  {group.entries.length}
                </span>
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.entries.map((entry) => (
                  <AlgorithmCard key={entry.id} entry={entry} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
