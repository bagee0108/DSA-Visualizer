/**
 * The learning path: every algorithm as a numbered level on one route, with a
 * difficulty tier. The order and the tiers live here and nowhere else, so
 * revising either is a one-file change. Whether a level is open is not stored:
 * it is open exactly when its id is registered.
 *
 * The order and tiers are provisional and expected to be revised.
 */

import { CATALOG, type CatalogEntry } from '../catalog';
import { isRegistered } from './registry';

export type Tier = 1 | 2 | 3;

export const TIER_LABEL: Record<Tier, string> = {
  1: 'beginner',
  2: 'intermediate',
  3: 'advanced',
};

export type LaneId = 'arrays' | 'trees' | 'graphs' | 'advanced';

interface LevelSpec {
  readonly id: string;
  readonly tier: Tier;
  /** Only for a level that is not a catalog algorithm, such as race mode. */
  readonly name?: string;
}

const LANES: ReadonlyArray<{ readonly id: LaneId; readonly levels: readonly LevelSpec[] }> = [
  {
    id: 'arrays',
    levels: [
      { id: 'binary-search', tier: 1 },
      { id: 'two-pointers', tier: 1 },
      { id: 'sliding-window', tier: 1 },
      { id: 'kadane', tier: 2 },
      { id: 'mergesort', tier: 1 },
      { id: 'quicksort', tier: 2 },
      { id: 'heapsort', tier: 2 },
    ],
  },
  {
    id: 'trees',
    levels: [
      { id: 'tree-traversals', tier: 1 },
      { id: 'bst', tier: 1 },
      { id: 'avl', tier: 2 },
      { id: 'red-black', tier: 3 },
      { id: 'binary-heap', tier: 2 },
      { id: 'trie', tier: 2 },
    ],
  },
  {
    id: 'graphs',
    levels: [
      { id: 'bfs', tier: 1 },
      { id: 'dfs', tier: 1 },
      { id: 'dijkstra', tier: 2 },
      { id: 'union-find', tier: 2 },
      { id: 'topological-sort', tier: 2 },
      { id: 'kruskal', tier: 2 },
      { id: 'prim', tier: 2 },
      { id: 'bellman-ford', tier: 3 },
      { id: 'astar', tier: 2 },
      { id: 'tarjan-scc', tier: 3 },
    ],
  },
  {
    id: 'advanced',
    levels: [
      { id: 'lis', tier: 2 },
      { id: 'lcs', tier: 2 },
      { id: 'edit-distance', tier: 2 },
      { id: 'knapsack', tier: 2 },
      { id: 'kmp', tier: 3 },
      { id: 'segment-tree', tier: 3 },
      { id: 'fenwick', tier: 3 },
      { id: 'n-queens', tier: 2 },
      { id: 'sudoku', tier: 3 },
      { id: 'race-mode', tier: 2, name: 'Race mode' },
    ],
  },
];

export interface Level {
  readonly id: string;
  /** 1-based position on the whole route. */
  readonly number: number;
  readonly name: string;
  readonly tier: Tier;
  readonly lane: LaneId;
  /** The catalog entry, absent for a level that is not an algorithm. */
  readonly entry: CatalogEntry | undefined;
}

const byId = new Map(CATALOG.map((entry) => [entry.id, entry]));

export const LEVELS: readonly Level[] = LANES.flatMap((lane) => lane.levels).map((spec, index) => {
  const entry = byId.get(spec.id);
  const lane = LANES.find((candidate) => candidate.levels.includes(spec));
  return {
    id: spec.id,
    number: index + 1,
    name: spec.name ?? entry?.name ?? spec.id,
    tier: spec.tier,
    lane: lane?.id ?? 'advanced',
    entry,
  };
});

export const LANE_IDS: readonly LaneId[] = LANES.map((lane) => lane.id);

const levelById = new Map(LEVELS.map((level) => [level.id, level]));

export function levelFor(id: string): Level | undefined {
  return levelById.get(id);
}

/** A level can be opened exactly when its algorithm is registered. */
export function isOpen(level: Level): boolean {
  return isRegistered(level.id);
}

/** The nearest open level before or after this one on the route. */
export function neighbour(level: Level, direction: -1 | 1): Level | undefined {
  for (let at = level.number - 1 + direction; at >= 0 && at < LEVELS.length; at += direction) {
    const candidate = LEVELS[at];
    if (candidate !== undefined && isOpen(candidate)) return candidate;
  }
  return undefined;
}

/** Where "Start the path" goes: the first open level. */
export function firstOpenLevel(): Level | undefined {
  return LEVELS.find(isOpen);
}
