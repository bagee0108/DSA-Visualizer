/** Prim's minimum spanning tree: grow one tree, always taking the cheapest edge leaving it, from a lazy heap. */

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
  parseStart,
  seedField,
  startField,
} from '../../core/graphInput';
import { GraphScene, edgeRef } from '../../core/graphScene';
import type { Graph, GraphEdge, Strip } from '../../core/types';
import { MinHeap } from './minHeap';
import { componentsOf, DIRECTED_ERROR, fmt, mstPresets } from './mst';

interface PrimInput {
  readonly graph: Graph;
  readonly start: string;
}

const CODE = `function prim(start: Node): Edge[] {
  for (const v of nodes) key[v] = Infinity;
  for (const root of [start, ...nodes]) {        // one tree per piece: a spanning forest
    if (inTree.has(root)) continue;
    key[root] = 0;
    pq.push([0, root]);
    while (pq.size > 0) {
      const [k, u] = pq.popMin();                // extract-min: the cheapest edge leaving the tree
      if (inTree.has(u)) continue;               // stale: u joined through a cheaper edge
      inTree.add(u);                             // safe by the cut property
      if (via[u]) tree.push(via[u]);
      for (const [v, w] of neighbours(u)) {
        if (inTree.has(v) || w >= key[v]) continue;
        key[v] = w;                              // a cheaper edge from the tree to v
        via[v] = [u, v, w];
        pq.push([w, v]);                         // lazy: v's older entry stays and goes stale
      }
    }
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
  init: lineOf('key[v] = Infinity'),
  root: lineOf('key[root] = 0'),
  pop: lineOf('pq.popMin()'),
  stale: lineOf('stale: u joined'),
  join: lineOf('inTree.add(u)'),
  test: lineOf('w >= key[v]'),
  push: lineOf('pq.push([w, v])'),
  done: lineOf('return tree'),
} as const;

function parse(params: ParamMap): ParseResult<PrimInput> {
  if (parseDirected(params.directed)) return { ok: false, error: DIRECTED_ERROR };
  const list = parseEdgeList(params.g ?? '', { requireWeights: true });
  if (!list.ok) return list;
  const start = parseStart(params.start, list.value.nodeCount);
  if (!start.ok) return start;
  return { ok: true, value: { graph: buildGraph(list.value, false, parseLayout(params.layout)), start: String(start.value) } };
}

export const PRIM_PRESETS: readonly PresetSpec[] = mstPresets({
  textbook: 'the 9-node example from CLRS chapter 23. Its minimum spanning trees weigh 37, the same total Kruskal finds; there is more than one, because of the tied edges.',
  ties: 'every weight is 1 or 2, so many edges tie; the heap breaks ties by push order, so Prim can pick a different tree from Kruskal, of the same weight.',
  dense: 'about three and a half edges per node, so a waiting node often finds a cheaper edge into the tree; each time, its older queue entry is left to surface stale.',
  disconnected: 'three separate islands and, from 8 nodes, one node on its own: when the queue runs dry, Prim starts a new tree, so the result is a spanning forest, one tree per piece.',
});

export const prim = defineAlgorithm<PrimInput>({
  meta: {
    id: 'prim',
    name: "Prim's MST",
    category: 'graphs',
    structureKind: 'graph',
    blurb: 'Grow one tree, always taking the cheapest edge leaving it.',
    complexity: {
      time: { best: 'O(E log V)', average: 'O(E log V)', worst: 'O(E log V)' },
      space: 'O(V + E)',
      notes: [
        'The tree and the rest of the graph are two sides of a cut. The cheapest edge across a cut is always safe to take: some minimum spanning tree contains it. Taking it moves one node across, and the next cut is checked the same way.',
        "Each node's key is the cheapest edge known from the tree to it. The queue is a binary heap drawn in array order, minimum first, as in Dijkstra: a cheaper edge pushes a fresh entry, and the older one is skipped as stale when it surfaces.",
        'Up to one push per edge examined, each O(log V) give or take, so O(E log V). Kruskal sorts all the edges first instead; Prim only ever looks at the edges leaving the tree.',
        'With tied weights the minimum spanning tree may not be unique: every one has the same total, but which tied edge wins depends on the order. Here ties leave the heap in push order.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons'],
  },
  fields: [edgesField('0-1:4,0-7:8,1-2:8,1-7:11,2-3:7,2-5:4,2-8:2,3-4:9,3-5:14,4-5:10,5-6:2,6-7:1,6-8:6,7-8:7', true), directedField, startField, layoutField, seedField],
  presets: PRIM_PRESETS,
  sizeRange: { min: 4, max: MAX_GRAPH_NODES, step: 1 },
  sizeOf: graphSizeOf,
  parse,
  *run(input) {
    const { graph, start } = input;
    const scene = new GraphScene(graph, { visitedCounter: 'nodes in tree' });
    const name = (id: string): string => scene.label(id);
    const key = new Map<string, number>();
    const via = new Map<string, GraphEdge>();
    const pq = new MinHeap();
    const pieces = componentsOf(graph);
    const target = graph.nodes.length - pieces;
    const accepted: GraphEdge[] = [];
    let weight = 0;
    for (const id of scene.nodeIds) {
      key.set(id, Number.POSITIVE_INFINITY);
      scene.setLabel(id, '∞');
    }

    const chip = (edge: GraphEdge): { id: string; label: string } => ({ id: edge.id, label: `${name(edge.from)}-${name(edge.to)}:${fmt(edge.weight ?? 0)}` });
    let tree: Strip = Object.freeze({ label: 'tree edges', kind: 'output' as const, items: Object.freeze([]) });
    const strips = (): readonly Strip[] => [
      scene.chips('pq', 'priority queue', pq.entries.map((entry) => ({ id: `q${entry.seq}`, label: `${name(entry.node)}:${fmt(entry.key)}` }))),
      tree,
    ];
    const progress = (): string => `${accepted.length} of ${target} taken`;

    let trees = 0;
    for (const root of [start, ...scene.nodeIds]) {
      if (scene.isVisited(root)) continue;
      trees += 1;
      key.set(root, 0);
      scene.setLabel(root, '0');
      const first = pq.push(0, root);
      yield scene.frame({
        codeLine: trees === 1 ? LINE.init : LINE.root,
        explanation:
          trees === 1
            ? `prim(${name(root)}): every key starts at ∞ except the start at 0. A key is the cheapest edge known from the tree to that node; the tree is empty, so ${name(root)} is the only queue entry.`
            : `The queue is empty, but ${graph.nodes.length - scene.visitedCount} node${graph.nodes.length - scene.visitedCount === 1 ? ' is' : 's are'} not in any tree: no edge reaches them from the trees so far. Start tree ${trees} at ${name(root)}, key 0.`,
        highlights: { active: [root], candidate: [`pq:q${first.seq}`] },
        pointers: { root },
        strips: strips(),
        phase: progress(),
      });

      while (pq.size > 0) {
        const entry = pq.pop();
        if (entry === undefined) break;
        const u = entry.node;
        const k = entry.key;
        scene.countComparison();
        if (scene.isVisited(u)) {
          scene.bump('stale pops');
          yield scene.frame({
            codeLine: LINE.stale,
            explanation: `Extract-min gives ${name(u)} at ${fmt(k)}, but ${name(u)} is already in the tree: it joined through a cheaper edge after this entry was pushed. Skip it.`,
            highlights: { excluded: [u] },
            pointers: { u },
            strips: strips(),
            phase: progress(),
          });
          continue;
        }

        scene.visit(u);
        const edge = via.get(u);
        const tags: string[] = [];
        if (edge !== undefined) {
          accepted.push(edge);
          weight += k;
          scene.setTreeEdge(edge);
          scene.bump('MST weight', k);
          tree = Object.freeze({ label: 'tree edges', kind: 'output' as const, items: Object.freeze(accepted.map(chip)) });
          tags.push(edgeRef(edge), `output:${edge.id}`);
        }
        const from = edge === undefined ? null : edge.from === u ? edge.to : edge.from;
        yield scene.frame({
          codeLine: LINE.join,
          explanation:
            edge === undefined || from === null
              ? `Extract-min gives ${name(u)} at 0: the root of tree ${trees}. It joins with no edge.`
              : `Extract-min gives ${name(u)} at ${fmt(k)}: ${name(from)}-${name(u)} (${fmt(k)}) is the cheapest edge leaving the tree. It crosses the cut between the tree and the rest, and is the lightest that does, so it is safe: take it. MST weight ${fmt(weight)}.`,
          highlights: { active: [u], sorted: tags },
          pointers: { u },
          strips: strips(),
          phase: progress(),
        });

        for (const neighbour of scene.neighbours(u)) {
          const v = scene.examine(neighbour);
          const w = neighbour.edge.weight ?? 0;
          const ref = edgeRef(neighbour.edge);
          const known = key.get(v) ?? Number.POSITIVE_INFINITY;
          scene.countComparison();
          if (scene.isVisited(v)) {
            yield scene.frame({
              codeLine: LINE.test,
              explanation: `${name(u)}-${name(v)} (${fmt(w)}): ${name(v)} is already in the tree, so this edge does not leave it.`,
              highlights: { active: [u], excluded: [v, ref] },
              pointers: { u, v },
              strips: strips(),
              phase: progress(),
            });
            continue;
          }
          if (w >= known) {
            yield scene.frame({
              codeLine: LINE.test,
              explanation: `${name(u)}-${name(v)} (${fmt(w)}): not cheaper than the ${fmt(known)} already known for ${name(v)}. Leave it.`,
              highlights: { active: [u], excluded: [v, ref] },
              pointers: { u, v },
              strips: strips(),
              phase: progress(),
            });
            continue;
          }
          key.set(v, w);
          via.set(v, neighbour.edge);
          scene.setLabel(v, fmt(w));
          const pushed = pq.push(w, v);
          yield scene.frame({
            codeLine: LINE.push,
            explanation:
              known === Number.POSITIVE_INFINITY
                ? `${name(u)}-${name(v)} (${fmt(w)}): the first edge from the tree to ${name(v)}. Its key drops from ∞ to ${fmt(w)}; push (${fmt(w)}, ${name(v)}).`
                : `${name(u)}-${name(v)} (${fmt(w)}): cheaper than the ${fmt(known)} known for ${name(v)}. Its key drops to ${fmt(w)} and a fresh entry is pushed; the old one will surface stale.`,
            highlights: { active: [u], candidate: [v, ref, `pq:q${pushed.seq}`] },
            pointers: { u, v },
            strips: strips(),
            phase: progress(),
          });
        }
      }
    }

    yield scene.frame({
      codeLine: LINE.done,
      explanation:
        trees === 1
          ? `Queue empty and every node is in the tree: a minimum spanning tree of ${accepted.length} edges, total weight ${fmt(weight)}.`
          : `Done: the graph is not connected, so there is no spanning tree. Prim grew ${trees} trees, one per piece: a minimum spanning forest of ${accepted.length} edges, total weight ${fmt(weight)}.`,
      highlights: { sorted: accepted.map(edgeRef) },
      strips: [scene.chips('pq', 'priority queue', []), tree],
      phase: 'done',
    });
  },
});
