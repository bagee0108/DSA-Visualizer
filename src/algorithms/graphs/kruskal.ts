/** Kruskal's minimum spanning tree: edges cheapest first, kept unless they would close a cycle, with union-find deciding. */

import { defineAlgorithm, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
import {
  buildGraph,
  directedField,
  edgesField,
  graphSizeOf,
  layoutField,
  MAX_GRAPH_NODES,
  parseDirected,
  parseEdgeList,
  parseLayout,
  seedField,
} from '../../core/graphInput';
import { GraphScene, edgeRef } from '../../core/graphScene';
import type { Frame, Graph, GraphEdge, Strip } from '../../core/types';
import { componentsOf, DIRECTED_ERROR, fmt, mstPresets } from './mst';
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

function parse(params: ParamMap): ParseResult<KruskalInput> {
  if (parseDirected(params.directed)) return { ok: false, error: DIRECTED_ERROR };
  const list = parseEdgeList(params.g ?? '', { requireWeights: true });
  if (!list.ok) return list;
  return { ok: true, value: { graph: buildGraph(list.value, false, parseLayout(params.layout)) } };
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

export const KRUSKAL_PRESETS: readonly PresetSpec[] = mstPresets({
  textbook: 'the 9-node example from CLRS chapter 23. Its minimum spanning trees weigh 37; there is more than one, because of the tied edges.',
  ties: 'every weight is 1 or 2, so many edges tie; the sort breaks ties by endpoints, and a different tie order could give a different tree of the same weight.',
  dense: 'about three and a half edges per node, so most edges end up rejected: by the time they come up, their ends are already joined.',
  disconnected: 'three separate islands and, from 8 nodes, one node on its own: no spanning tree exists, so Kruskal builds a spanning forest, one tree per piece.',
});

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
