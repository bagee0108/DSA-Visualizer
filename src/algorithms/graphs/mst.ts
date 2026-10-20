/** What Kruskal's and Prim's levels share: the refusal of directed input, the number format, and the presets. */

import type { ParamMap, PresetSpec } from '../../core/define';
import { formatEdgeList, MAX_GRAPH_EDGES, regenerating, type EdgeListEdge } from '../../core/graphInput';
import { randomInt } from '../../core/random';

export const DIRECTED_ERROR =
  'A minimum spanning tree is defined for undirected graphs. Switch "Edges are" to Undirected. On a directed graph the question becomes a minimum arborescence, which needs a different algorithm.';

/** As drawn: a true minus for negatives, which stays legible at label size. */
export function fmt(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded < 0 ? `−${-rounded}` : String(rounded);
}

/* ---------------- presets: undirected and weighted ---------------- */

function finish(edges: readonly EdgeListEdge[], size: number, rng: () => number): ParamMap {
  const touched = new Set<number>();
  for (const edge of edges) {
    touched.add(edge.from);
    touched.add(edge.to);
  }
  const isolated = Array.from({ length: size }, (_, i) => i).filter((i) => !touched.has(i));
  return { g: formatEdgeList(edges.slice(0, MAX_GRAPH_EDGES), isolated), directed: '0', layout: 'auto', seed: String(randomInt(rng, 0, 999999)) };
}

/** The 9-node example from CLRS chapter 23 (a..i as 0..8). Its minimum spanning trees weigh 37. */
const TEXTBOOK: readonly EdgeListEdge[] = [
  { from: 0, to: 1, weight: 4 },
  { from: 0, to: 7, weight: 8 },
  { from: 1, to: 2, weight: 8 },
  { from: 1, to: 7, weight: 11 },
  { from: 2, to: 3, weight: 7 },
  { from: 2, to: 5, weight: 4 },
  { from: 2, to: 8, weight: 2 },
  { from: 3, to: 4, weight: 9 },
  { from: 3, to: 5, weight: 14 },
  { from: 4, to: 5, weight: 10 },
  { from: 5, to: 6, weight: 2 },
  { from: 6, to: 7, weight: 1 },
  { from: 6, to: 8, weight: 6 },
  { from: 7, to: 8, weight: 7 },
];

/** A connected graph on `from`..`to`-1: a tree from each node to one of the few before it, plus `extra` more edges between near ids. */
function connected(from: number, to: number, extra: number, rng: () => number, weight: () => number, seen = new Set<string>()): EdgeListEdge[] {
  const edges: EdgeListEdge[] = [];
  const add = (a: number, b: number): boolean => {
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (a === b || seen.has(key)) return false;
    seen.add(key);
    edges.push({ from: Math.min(a, b), to: Math.max(a, b), weight: weight() });
    return true;
  };
  for (let i = from + 1; i < to; i++) add(randomInt(rng, Math.max(from, i - 4), i - 1), i);
  for (let tries = 0; extra > 0 && tries < (to - from) * 30; tries++) {
    const a = randomInt(rng, from, to - 2);
    if (add(a, randomInt(rng, a + 1, Math.min(to - 1, a + 6)))) extra -= 1;
  }
  return edges;
}

/** What each preset shows, worded for the level that uses it. */
export type MstPresetDescriptions = Readonly<Record<'textbook' | 'ties' | 'dense' | 'disconnected', string>>;

/** The presets Kruskal and Prim share, so the two can be compared graph for graph. */
export function mstPresets(describe: MstPresetDescriptions): readonly PresetSpec[] {
  return regenerating([
    {
      id: 'textbook',
      label: 'Textbook graph',
      maxSize: 9,
      capReason: 'it is the fixed example from CLRS chapter 23',
      build: (_size, rng) => finish(TEXTBOOK, 9, rng),
      description: describe.textbook,
    },
    {
      id: 'ties',
      label: 'Many equal weights',
      build: (size, rng) => finish(connected(0, size, Math.round(size * 0.6), rng, () => randomInt(rng, 1, 2)), size, rng),
      description: describe.ties,
    },
    {
      id: 'dense',
      label: 'Dense',
      build: (size, rng) => finish(connected(0, size, Math.min(MAX_GRAPH_EDGES - size, Math.round(size * 2.5)), rng, () => randomInt(rng, 1, 20)), size, rng),
      description: describe.dense,
    },
    {
      id: 'disconnected',
      label: 'Disconnected',
      build: (size, rng) => {
        // Three islands and, past a handful of nodes, one node on its own.
        const loner = size >= 8 ? 1 : 0;
        const rest = size - loner;
        const cut1 = Math.max(2, Math.floor(rest / 3));
        const cut2 = Math.max(cut1 + 2, Math.floor((2 * rest) / 3));
        const seen = new Set<string>();
        const weight = (): number => randomInt(rng, 1, 9);
        const edges = [
          ...connected(0, cut1, Math.round(cut1 * 0.4), rng, weight, seen),
          ...connected(cut1, cut2, Math.round((cut2 - cut1) * 0.4), rng, weight, seen),
          ...connected(cut2, rest, Math.round((rest - cut2) * 0.4), rng, weight, seen),
        ];
        return finish(edges, size, rng);
      },
      description: describe.disconnected,
    },
  ]);
}
