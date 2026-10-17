/** Browse all: every algorithm on the roadmap, grouped by category, searchable. */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

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
import { levelFor } from '../core/levels';
import type { Category } from '../core/define';
import { TierLabel } from '../components/level';
import { Chip, ChipGroup, FOCUS_RING } from '../components/ui';
import { usePrefersReducedMotion } from '../hooks/useMotion';
import { Link } from '../router/router';

const PHASES: readonly Phase[] = [1, 2, 3, 4];
/** Stagger step, and the card after which every remaining card shares a delay. */
const STAGGER_MS = 25;
const STAGGER_CAP = 24;

type Register = (id: string, node: HTMLElement | null) => void;

function AlgorithmCard({ entry, register }: { entry: CatalogEntry; register: Register }): ReactNode {
  const ready = isRegistered(entry.id);
  const hold = useCallback((node: HTMLElement | null) => register(entry.id, node), [entry.id, register]);

  const level = levelFor(entry.id);
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <h3
          className={`font-display text-meta font-stretch-semi-condensed ${ready ? 'font-semibold text-fg' : 'text-fg-dim'}`}
        >
          {entry.name}
        </h3>
        {level !== undefined && (
          <span className="shrink-0 font-mono text-micro tabular-nums text-fg-mute">lv {level.number}</span>
        )}
      </div>
      <p className="mt-1 text-meta leading-snug text-fg-dim">{entry.blurb}</p>
      {level !== undefined && <TierLabel tier={level.tier} className="mt-1.5 text-micro text-fg-mute" />}
    </>
  );

  if (!ready) {
    return (
      <div
        ref={hold}
        className="rounded-sm border border-dashed border-line px-3 py-2 opacity-70"
        aria-label={`${entry.name}, coming soon`}
      >
        {body}
        <p className="mt-1 font-mono text-micro text-fg-mute">soon</p>
      </div>
    );
  }

  return (
    <Link
      ref={hold}
      to={`/visualize/${entry.id}`}
      className={`rounded-sm border border-line bg-panel px-3 py-2 transition hover:-translate-y-px hover:border-accent-line hover:bg-raised ${FOCUS_RING}`}
    >
      {body}
    </Link>
  );
}

export function BrowsePage(): ReactNode {
  const [query, setQuery] = useState('');
  const [phaseFilter, setPhaseFilter] = useState<Phase | null>(null);
  const reduced = usePrefersReducedMotion();

  const cards = useRef(new Map<string, HTMLElement>());
  const placed = useRef(new Map<string, DOMRect>());

  const register = useCallback<Register>((id, node) => {
    if (node === null) cards.current.delete(id);
    else cards.current.set(id, node);
  }, []);

  useEffect(() => {
    document.title = 'Browse all - Lowlink';
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

  /**
   * Filtering moves the grid rather than redrawing it: every card that
   * survives is translated back to where it was and released, and only the
   * cards that are genuinely new animate in.
   */
  useLayoutEffect(() => {
    const before = placed.current;
    const after = new Map<string, DOMRect>();
    for (const [id, node] of cards.current) after.set(id, node.getBoundingClientRect());
    placed.current = after;
    if (reduced) return;

    let arrivals = 0;
    for (const [id, node] of cards.current) {
      const from = before.get(id);
      const to = after.get(id);
      if (to === undefined) continue;

      if (from === undefined) {
        const delay = Math.min(arrivals, STAGGER_CAP) * STAGGER_MS;
        arrivals += 1;
        node.style.animation = `viz-card-in var(--duration-base) var(--ease-enter) ${delay}ms backwards`;
        continue;
      }

      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      node.style.transition = 'none';
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        node.style.transition = 'transform var(--duration-slow) var(--ease-ui)';
        node.style.transform = '';
      });
    }
  }, [grouped, reduced]);

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <div className="mx-auto max-w-6xl">
        <header className="mb-4">
          <h1 className="font-display text-section font-bold text-fg">Browse all</h1>
          <p className="mt-0.5 text-meta text-fg-dim">
            Every run is stepped, scrubbed and counted.{' '}
            <span className="font-mono tabular-nums">
              {readyCount} of {CATALOG.length}
            </span>{' '}
            implemented.
          </p>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search algorithms, techniques, tags..."
            className="min-w-60 flex-1 rounded-sm border border-edge bg-panel px-2 py-1 text-ui text-fg outline-none placeholder:text-fg-mute focus:border-focus"
            aria-label="Search algorithms"
          />
          <ChipGroup label="Filter by phase" className="gap-1">
            <Chip pressed={phaseFilter === null} onClick={() => setPhaseFilter(null)} className="text-meta">
              All
            </Chip>
            {PHASES.map((phase) => (
              <Chip
                key={phase}
                pressed={phaseFilter === phase}
                onClick={() => setPhaseFilter(phase === phaseFilter ? null : phase)}
                title={PHASE_LABEL[phase]}
                className="text-meta"
              >
                P{phase}
              </Chip>
            ))}
          </ChipGroup>
        </div>

        {total === 0 ? (
          <p className="rounded-sm border border-dashed border-line px-4 py-8 text-center text-meta text-fg-mute">
            Nothing matches &quot;{query}&quot;.
          </p>
        ) : (
          <div className="space-y-4 pb-8">
            {grouped.map((group) => (
              <section key={group.category}>
                <h2 className="mb-1.5 font-display text-meta font-semibold font-stretch-semi-condensed text-fg-dim">
                  <span className="font-normal text-fg-mute">~/</span>
                  {CATEGORY_LABEL[group.category].toLowerCase()}
                  <span className="ml-2 font-mono text-micro font-normal tabular-nums text-fg-mute">{group.entries.length}</span>
                </h2>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.entries.map((entry) => (
                    <AlgorithmCard key={entry.id} entry={entry} register={register} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
