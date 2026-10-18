/** Kruskal's minimum spanning tree: edges cheapest first, kept unless they would close a cycle, with union-find deciding. */

import { defineAlgorithm, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
import {
  buildGraph,
  directedField,
  edgesField,
  formatEdgeList,
  graphSizeOf,
  layoutField,
  MAX_GRAPH_EDGES,
  MAX_GRAPH_NODES,
  parseDirected,
  parseEdgeList,
  parseLayout,
  seedField,
  type EdgeListEdge,
} from '../../core/graphInput';
import { GraphScene, edgeRef } from '../../core/graphScene';
import { randomInt } from '../../core/random';
import type { Frame, Graph, GraphEdge, Strip } from '../../core/types';
import { DisjointSets } from './unionFindCore';

interface KruskalInput {
  readonly graph: Graph;
}

const CODE = `function kruskal(): Edge[] {
  const sorted = [...edges].sort(byWeight);      // ties: smaller endpoint pair first
  const tree: Edge[] = [];
  for (const [u, v, w] of sorted) {
    const ru = find(u), rv = find(v);            // which tree is each end in?
    if (ru === rv) continue;                     // same tree already: this edge would close a cycle
    union(ru, rv);                               // by rank, as in Union-Find
    tree.push([u, v, w]);
    if (tree.length === nodes.length - components) break;   // the spanning forest is complete
  }
  return tree;
}`;

const CODE_LINES = CODE.split('\n');
function lineOf(text: string): number {
  const at = CODE_LINES.findIndex((line) => line.includes(text));
  if (at < 0) throw new Error(`no code line contains ${text}`);
  return at + 1;
}

const LINE = {
  sort: lineOf('sort(byWeight)'),
  find: lineOf('find(u), rv = find(v)'),
  same: lineOf('ru === rv'),
  union: lineOf('union(ru, rv)'),
  push: lineOf('tree.push'),
  stop: lineOf('spanning forest is complete'),
  done: lineOf('return tree'),
} as const;

export const DIRECTED_ERROR =
  'A minimum spanning tree is defined for undirected graphs. Switch "Edges are" to Undirected. On a directed graph the question becomes a minimum arborescence, which needs a different algorithm.';

function parse(params: ParamMap): ParseResult<KruskalInput> {
  if (parseDirected(params.directed)) return { ok: false, error: DIRECTED_ERROR };
  const list = parseEdgeList(params.g ?? '', { requireWeights: true });
  if (!list.ok) return list;
  return { ok: true, value: { graph: buildGraph(list.value, false, parseLayout(params.layout)) } };
}

/** As drawn: a true minus for negatives, which stays legible at label size. */
function fmt(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded < 0 ? `−${-rounded}` : String(rounded);
}

/** Cheapest first; equal weights by (smaller endpoint, larger endpoint), so every run sorts the same way. */
export function kruskalOrder(edges: readonly GraphEdge[]): GraphEdge[] {
  const key = (edge: GraphEdge): [number, number] => {
    const a = Number(edge.from);
    const b = Number(edge.to);
    return a < b ? [a, b] : [b, a];
  };
  return [...edges].sort((x, y) => {
    const byWeight = (x.weight ?? 0) - (y.weight ?? 0);
    if (byWeight !== 0) return byWeight;
    const [x1, x2] = key(x);
    const [y1, y2] = key(y);
    return x1 - y1 || x2 - y2;
  });
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

export const KRUSKAL_PRESETS: readonly PresetSpec[] = [
  {
    id: 'textbook',
    label: 'Textbook graph',
    maxSize: 9,
    capReason: 'it is the fixed example from CLRS chapter 23',
    build: (_size, rng) => finish(TEXTBOOK, 9, rng),
    description: 'the 9-node example from CLRS chapter 23. Its minimum spanning trees weigh 37; there is more than one, because of the tied edges.',
  },
  {
    id: 'ties',
    label: 'Many equal weights',
    build: (size, rng) => finish(connected(0, size, Math.round(size * 0.6), rng, () => randomInt(rng, 1, 2)), size, rng),
    description: 'every weight is 1 or 2, so many edges tie; the sort breaks ties by endpoints, and a different tie order could give a different tree of the same weight.',
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
    description: 'three separate islands and, from 8 nodes, one node on its own: no spanning tree exists, so Kruskal builds a spanning forest, one tree per piece.',
  },
];

/** Number of connected pieces, isolated nodes included. */
function componentsOf(graph: Graph): number {
  const out = new Map<string, string[]>(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) {
    out.get(edge.from)?.push(edge.to);
    out.get(edge.to)?.push(edge.from);
  }
  const seen = new Set<string>();
  let pieces = 0;
  for (const node of graph.nodes) {
    if (seen.has(node.id)) continue;
    pieces += 1;
    const queue = [node.id];
    seen.add(node.id);
    for (let head = 0; head < queue.length; head++) {
      for (const next of out.get(queue[head] ?? '') ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  }
  return pieces;
}

type Gen = Generator<Frame, void, undefined>;

export const kruskal = defineAlgorithm<KruskalInput>({
  meta: {
    id: 'kruskal',
    name: "Kruskal's MST",
    category: 'graphs',
    structureKind: 'graph',
    blurb: 'Sort the edges, then add any edge that joins two components.',
    complexity: {
      time: { best: 'O(E log E)', average: 'O(E log E)', worst: 'O(E log E)' },
      space: 'O(V + E)',
      notes: [
        'Sorting the edges dominates. Each edge then costs two finds and maybe a union, nearly constant each with union by rank and path compression.',
        'The cheapest edge between two separate trees is always safe to take: some minimum spanning tree contains it (the cut property). So taking edges cheapest first, and skipping any whose ends are already joined, builds a minimum one.',
        'An edge whose ends already share a root would close a cycle, and every edge on that cycle is no heavier, so it is never needed.',
        'With tied weights the minimum spanning tree may not be unique: the total weight is the same, but which tied edge wins depends on the order. This run breaks ties by the smaller endpoint pair.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons'],
  },
  fields: [edgesField('0-1:4,0-7:8,1-2:8,1-7:11,2-3:7,2-5:4,2-8:2,3-4:9,3-5:14,4-5:10,5-6:2,6-7:1,6-8:6,7-8:7', true), directedField, layoutField, seedField],
  presets: KRUSKAL_PRESETS,
  sizeRange: { min: 4, max: MAX_GRAPH_NODES, step: 1 },
  sizeOf: graphSizeOf,
  parse,
  *run(input) {
    yield* runKruskal(input.graph);
  },
});

function* runKruskal(graph: Graph): Gen {
  const scene = new GraphScene(graph, { visitedCounter: 'nodes joined' });
  const name = (id: string): string => scene.label(id);
  const sorted = kruskalOrder(graph.edges);
  const pieces = componentsOf(graph);
  const target = graph.nodes.length - pieces;
  const accepted: GraphEdge[] = [];
  let weight = 0;
  let at = 0;

  const chip = (edge: GraphEdge): { id: string; label: string } => ({ id: edge.id, label: `${name(edge.from)}-${name(edge.to)}:${fmt(edge.weight ?? 0)}` });
  const chips = sorted.map(chip);
  // The rest of the sorted list from edge i, built once and shared by every frame.
  const rest: readonly Strip[] = sorted.map((_, i) => Object.freeze({ label: 'sorted edges', kind: 'queue' as const, items: Object.freeze(chips.slice(i)) }));
  const none: Strip = Object.freeze({ label: 'sorted edges', kind: 'queue' as const, items: Object.freeze([]) });
  let tree: Strip = Object.freeze({ label: 'tree edges', kind: 'output' as const, items: Object.freeze([]) });
  const strips = (): readonly Strip[] => [rest[at] ?? none, tree];
  const current = (): GraphEdge | undefined => sorted[at];

  const forest = new DisjointSets(scene, {
    byRank: true,
    compress: true,
    lines: { findEnter: LINE.find, climb: LINE.find, findReturn: LINE.find, compressSet: LINE.find, shorter: LINE.union, taller: LINE.union, equal: LINE.union },
    strips,
    findFrames: 'one-per-find',
    also: () => {
      const edge = current();
      return edge === undefined ? {} : { comparing: [edgeRef(edge)], active: [`queue:${edge.id}`] };
    },
  });

  const progress = (): string => `${accepted.length} of ${target} accepted`;
  const ties = sorted.some((edge, i) => i > 0 && edge.weight === sorted[i - 1]?.weight);

  yield scene.frame({
    codeLine: LINE.sort,
    explanation: `${sorted.length} edges sorted cheapest first. ${
      pieces === 1 ? `The graph is connected, so a spanning tree has V − 1 = ${target} edges.` : `The graph has ${pieces} separate pieces, so a spanning forest has V − ${pieces} = ${target} edges.`
    } ${ties ? 'Some weights tie, broken by the smaller endpoint pair, so the tree found may not be the only minimum one.' : 'No two weights tie, so the minimum spanning tree is unique.'}`,
    strips: strips(),
    phase: progress(),
  });

  for (at = 0; at < sorted.length; at++) {
    const edge = sorted[at] as GraphEdge;
    const { from: u, to: v } = edge;
    const w = edge.weight ?? 0;
    const ru = yield* forest.find(u, progress());
    const rv = yield* forest.find(v, progress());
    scene.countComparison();
    if (ru === rv) {
      scene.bump('edges rejected');
      yield scene.frame({
        codeLine: LINE.same,
        explanation: `${name(u)} and ${name(v)} already share root ${name(ru)}: this edge would close a cycle.`,
        highlights: { swapped: [edgeRef(edge)], pivot: [ru], active: [`queue:${edge.id}`] },
        pointers: { u, v, root: ru },
        strips: strips(),
        phase: progress(),
      });
      continue;
    }

    const { child, top, why } = forest.merge(ru, rv);
    accepted.push(edge);
    weight += w;
    scene.setTreeEdge(edge);
    scene.visit(u);
    scene.visit(v);
    scene.bump('edges accepted');
    scene.bump('MST weight', w);
    tree = Object.freeze({ label: 'tree edges', kind: 'output' as const, items: Object.freeze(accepted.map(chip)) });
    const complete = accepted.length === target;
    yield scene.frame({
      codeLine: complete ? LINE.stop : LINE.push,
      explanation: `${name(u)}-${name(v)} (${fmt(w)}) joins two different trees, rooted at ${name(ru)} and ${name(rv)}: take it. ${why} MST weight ${fmt(weight)}.${
        complete ? ` That is ${target} of ${target}: the spanning ${pieces === 1 ? 'tree' : 'forest'} is complete, so the remaining ${sorted.length - at - 1} edge${sorted.length - at - 1 === 1 ? '' : 's'} need not be looked at. Stop early.` : ''
      }`,
      highlights: { sorted: [edgeRef(edge), `output:${edge.id}`], pivot: [top], candidate: [child, `link:${child}`] },
      pointers: { u, v, root: top },
      strips: strips(),
      phase: progress(),
    });
    if (complete) break;
  }

  at = sorted.length;
  const forestText =
    pieces === 1
      ? `Done: a minimum spanning tree of ${accepted.length} edges, total weight ${fmt(weight)}.`
      : `Done: the graph is not connected, so there is no spanning tree. Kruskal built a minimum spanning forest instead: ${pieces} trees, one per piece, ${accepted.length} edges, total weight ${fmt(weight)}.`;
  yield scene.frame({
    codeLine: LINE.done,
    explanation: `${forestText}${ties ? ' Tied weights mean another minimum tree of the same weight may exist.' : ''}`,
    highlights: { sorted: accepted.map(edgeRef) },
    strips: [none, tree],
    phase: 'done',
  });
}
