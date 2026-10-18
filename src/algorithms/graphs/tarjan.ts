/** Tarjan's strongly connected components: one DFS, a low-link per node, and a stack that closes a component at its root. */

import { defineAlgorithm, type FieldSpec, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
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
  RING_CAP_REASON,
  RING_MAX_NODES,
  seedField,
  type EdgeListEdge,
} from '../../core/graphInput';
import type { LayoutKind } from '../../core/graphLayout';
import { GraphScene, edgeRef } from '../../core/graphScene';
import { randomInt, shuffle } from '../../core/random';
import type { Frame, Graph, Strip } from '../../core/types';

interface TarjanInput {
  readonly graph: Graph;
}

const CODE = `function strongConnect(u: Node): void {
  index[u] = low[u] = next++;                    // discovered
  stack.push(u); onStack.add(u);
  for (const v of neighbours(u)) {
    if (index[v] === undefined) {
      strongConnect(v);                          // tree edge: dive
      low[u] = Math.min(low[u], low[v]);         // v's subtree reaches as high as low[v]
    } else if (onStack.has(v)) {
      low[u] = Math.min(low[u], index[v]);       // edge back into the open component
    }                                            // else: v's component is closed, ignore
  }
  if (low[u] === index[u]) {                     // nothing below u reaches above it
    let w: Node;
    do {
      w = stack.pop(); onStack.delete(w);        // pop down to u:
      component.push(w);                         //   that is one whole component
    } while (w !== u);
    components.push(component);
  }
}

for (const u of nodes) {
  if (index[u] === undefined) strongConnect(u);
}`;

const LINE = { enter: 1, discover: 2, push: 3, scan: 4, recurse: 6, lowFromChild: 7, onStack: 8, lowFromIndex: 9, closed: 10, rootTest: 12, pop: 15, emit: 18, outer: 22, start: 23 } as const;

/** Shown beside a node before it is discovered: no index and no low-link yet. */
export const UNDISCOVERED = '–';

/** Same choices as every graph level, so the URL and the form stay familiar; undirected is refused in parse. */
const tarjanDirectedField: FieldSpec = { ...directedField, defaultValue: '1' };

export const UNDIRECTED_ERROR =
  'Strongly connected components are defined for directed graphs. Switch "Edges are" to Directed. In an undirected graph every connected piece is already strongly connected: DFS with restarts finds them.';

function parse(params: ParamMap): ParseResult<TarjanInput> {
  if (!parseDirected(params.directed)) return { ok: false, error: UNDIRECTED_ERROR };
  const list = parseEdgeList(params.g ?? '', { directed: true });
  if (!list.ok) return list;
  return { ok: true, value: { graph: buildGraph(list.value, true, parseLayout(params.layout)) } };
}

/* ---------------- presets: directed, with real cycles ---------------- */

function finish(edges: readonly EdgeListEdge[], size: number, rng: () => number, layout: LayoutKind): ParamMap {
  const touched = new Set<number>();
  for (const edge of edges) {
    touched.add(edge.from);
    touched.add(edge.to);
  }
  const isolated = Array.from({ length: size }, (_, i) => i).filter((i) => !touched.has(i));
  return { g: formatEdgeList(edges.slice(0, MAX_GRAPH_EDGES), isolated), directed: '1', layout, seed: String(randomInt(rng, 0, 999999)) };
}

/** Adds a directed edge unless it repeats one already there. */
function adder(edges: EdgeListEdge[]): (from: number, to: number) => boolean {
  const seen = new Set(edges.map((edge) => `${edge.from}>${edge.to}`));
  return (from, to) => {
    const key = `${from}>${to}`;
    if (from === to || seen.has(key)) return false;
    seen.add(key);
    edges.push({ from, to });
    return true;
  };
}

/** Groups of 2-6 nodes, each a directed cycle with an occasional chord, joined one way so the groups form a DAG. */
function clusters(size: number, rng: () => number): EdgeListEdge[] {
  const edges: EdgeListEdge[] = [];
  const add = adder(edges);
  const groups: number[][] = [];
  for (let at = 0; at < size; ) {
    const take = Math.min(size - at, randomInt(rng, 2, 6));
    groups.push(Array.from({ length: take }, (_, i) => at + i));
    at += take;
  }
  for (const group of groups) {
    if (group.length > 1) for (let i = 0; i < group.length; i++) add(group[i] ?? 0, group[(i + 1) % group.length] ?? 0);
    if (group.length > 3) add(group[0] ?? 0, group[2] ?? 0);
  }
  for (let g = 1; g < groups.length; g++) {
    const from = groups[randomInt(rng, Math.max(0, g - 3), g - 1)] ?? [];
    const to = groups[g] ?? [];
    add(from[randomInt(rng, 0, from.length - 1)] ?? 0, to[randomInt(rng, 0, to.length - 1)] ?? 0);
  }
  return edges;
}

/** A random tree pointing away from 0, plus extra edges in either direction; the backward ones make cycles. */
function randomDirected(size: number, rng: () => number): EdgeListEdge[] {
  const edges: EdgeListEdge[] = [];
  const add = adder(edges);
  for (let i = 1; i < size; i++) add(randomInt(rng, Math.max(0, i - 4), i - 1), i);
  let extra = Math.round(size * 0.5);
  for (let attempts = 0; extra > 0 && attempts < size * 20; attempts++) {
    const a = randomInt(rng, 0, size - 1);
    const b = randomInt(rng, Math.max(0, a - 6), Math.min(size - 1, a + 6));
    if (add(a, b)) extra -= 1;
  }
  return edges;
}

/** One cycle through every node, with chords: a single component however it is entered. */
function ringCycle(size: number, rng: () => number): EdgeListEdge[] {
  const edges: EdgeListEdge[] = [];
  const add = adder(edges);
  for (let i = 0; i < size; i++) add(i, (i + 1) % size);
  for (const i of shuffle(Array.from({ length: size }, (_, i) => i), rng).slice(0, Math.max(1, Math.floor(size / 5)))) {
    add(i, (i + Math.floor(size / 2)) % size);
  }
  return edges;
}

/** Edges only from a lower id to a higher one: no cycles, so every node is its own component. */
function dag(size: number, rng: () => number): EdgeListEdge[] {
  const edges: EdgeListEdge[] = [];
  const add = adder(edges);
  for (let i = 1; i < size; i++) add(randomInt(rng, Math.max(0, i - 4), i - 1), i);
  let extra = Math.round(size * 0.4);
  for (let attempts = 0; extra > 0 && attempts < size * 20; attempts++) {
    const a = randomInt(rng, 0, size - 2);
    if (add(a, randomInt(rng, a + 1, Math.min(size - 1, a + 6)))) extra -= 1;
  }
  return edges;
}

export const TARJAN_PRESETS: readonly PresetSpec[] = [
  { id: 'clusters', label: 'Cycles in a chain', build: (size, rng) => finish(clusters(size, rng), size, rng, 'auto') },
  { id: 'random', label: 'Random directed', build: (size, rng) => finish(randomDirected(size, rng), size, rng, 'auto') },
  {
    id: 'ring',
    label: 'One big cycle',
    maxSize: RING_MAX_NODES,
    capReason: RING_CAP_REASON,
    build: (requested, rng) => {
      const size = Math.min(requested, RING_MAX_NODES);
      return finish(ringCycle(size, rng), size, rng, 'ring');
    },
  },
  { id: 'dag', label: 'No cycles', build: (size, rng) => finish(dag(size, rng), size, rng, 'auto') },
];

type Gen = Generator<Frame, void, undefined>;

export const tarjanScc = defineAlgorithm<TarjanInput>({
  meta: {
    id: 'tarjan-scc',
    name: 'Tarjan SCC',
    category: 'graphs',
    structureKind: 'graph',
    blurb: 'Strongly connected components via low-link values in one DFS.',
    complexity: {
      time: { best: 'O(V + E)', average: 'O(V + E)', worst: 'O(V + E)' },
      space: 'O(V)',
      notes: [
        'One depth-first search: each node is discovered once and each edge examined once. Each node is pushed on the stack once and popped once, when its component closes.',
        "A node's low-link is the smallest index it can reach through its DFS subtree plus one edge back to a node still on the stack. When low[u] equals index[u], nothing below u climbs above it, so u is the root of a component and everything above it on the stack belongs with it.",
        'Components close in reverse topological order of the condensation: C1 has no edge into any component found after it. An edge to a node whose component is already closed is ignored, because that component cannot reach back.',
        'Each label reads index/low. A dash means not yet discovered.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'recursiveCalls'],
  },
  fields: [edgesField('0-10,1-4,2-6,3-8,4-1,5-0,5-3,6-4,6-9,7-3,8-7,9-2,9-7,10-2,10-5', false), tarjanDirectedField, layoutField, seedField],
  presets: TARJAN_PRESETS,
  sizeRange: { min: 4, max: MAX_GRAPH_NODES, step: 1 },
  sizeOf: graphSizeOf,
  parse,
  *run(input) {
    const scene = new GraphScene(input.graph);
    const index = new Map<string, number>();
    const low = new Map<string, number>();
    const stack: string[] = [];
    const onStack = new Set<string>();
    const closed: string[] = [];
    let next = 0;

    for (const id of scene.nodeIds) scene.setLabel(id, UNDISCOVERED);
    const name = (id: string): string => scene.label(id);
    const show = (id: string): void => scene.setLabel(id, `${index.get(id) ?? 0}/${low.get(id) ?? 0}`);
    const strips = (): readonly Strip[] => [
      scene.strip('stack', 'stack', stack),
      scene.chips('output', 'components', closed.map((id) => ({ id, label: id }))),
    ];

    function* strongConnect(u: string, parent: string | null): Gen {
      scene.countCall();
      scene.pushCall({ label: `strongConnect(${name(u)})`, codeLine: LINE.enter });
      scene.visit(u);
      index.set(u, next);
      low.set(u, next);
      next += 1;
      stack.push(u);
      onStack.add(u);
      show(u);
      yield scene.frame({
        codeLine: LINE.push,
        explanation:
          parent === null
            ? `strongConnect(${name(u)}): index ${index.get(u)}, and low-link ${low.get(u)} until something below shows it can reach higher. Push ${name(u)} on the stack.`
            : `strongConnect(${name(u)}), reached from ${name(parent)}: index ${index.get(u)}, low-link ${low.get(u)} for now. Push it on the stack.`,
        highlights: { active: [u], candidate: [`stack:${u}`] },
        pointers: { u },
        strips: strips(),
        phase: 'search',
      });

      for (const neighbour of scene.neighbours(u)) {
        const v = scene.examine(neighbour);
        const edge = edgeRef(neighbour.edge);
        scene.countComparison();
        if (!index.has(v)) {
          scene.setTreeEdge(neighbour.edge);
          yield scene.frame({
            codeLine: LINE.recurse,
            explanation: `${name(u)} -> ${name(v)}: ${name(v)} has no index yet, so this is a tree edge. Dive into ${name(v)}; ${name(u)}'s other edges wait.`,
            highlights: { active: [u], candidate: [v, edge] },
            pointers: { u, v },
            strips: strips(),
            phase: 'search',
          });
          yield* strongConnect(v, u);

          const before = low.get(u) ?? 0;
          const after = Math.min(before, low.get(v) ?? 0);
          scene.countComparison();
          low.set(u, after);
          show(u);
          if (after < before) scene.bump('low-link updates');
          yield scene.frame({
            codeLine: LINE.lowFromChild,
            explanation:
              after < before
                ? `Back in ${name(u)}: ${name(v)}'s subtree reaches index ${low.get(v)}, higher up than ${name(u)} could alone. low[${name(u)}] drops from ${before} to ${after}.`
                : onStack.has(v)
                  ? `Back in ${name(u)}: ${name(v)}'s low-link is ${low.get(v)}, no lower than ${name(u)}'s ${before}. low[${name(u)}] stays ${before}.`
                  : `Back in ${name(u)}: ${name(v)} already closed its own component, so low[${name(v)}] = ${low.get(v)} is no lower than ${before}. low[${name(u)}] stays ${before}.`,
            highlights: { active: [u], ...(after < before ? { pivot: [v] } : { visited: [v] }), comparing: [edge] },
            pointers: { u, v },
            strips: strips(),
            phase: 'search',
          });
          continue;
        }

        if (onStack.has(v)) {
          const before = low.get(u) ?? 0;
          const after = Math.min(before, index.get(v) ?? 0);
          scene.countComparison();
          low.set(u, after);
          show(u);
          if (after < before) scene.bump('low-link updates');
          yield scene.frame({
            codeLine: LINE.lowFromIndex,
            explanation:
              after < before
                ? `${name(u)} -> ${name(v)}: ${name(v)} is still on the stack, in the component being built, at index ${index.get(v)}. low[${name(u)}] drops from ${before} to ${after}.`
                : `${name(u)} -> ${name(v)}: ${name(v)} is on the stack at index ${index.get(v)}, but low[${name(u)}] is already ${before}. No change.`,
            highlights: { active: [u], pivot: [v, edge] },
            pointers: { u, v },
            strips: strips(),
            phase: 'search',
          });
          continue;
        }

        yield scene.frame({
          codeLine: LINE.closed,
          explanation: `${name(u)} -> ${name(v)}: ${name(v)} already belongs to a closed component, which has no way back to ${name(u)}. Ignore the edge.`,
          highlights: { active: [u], excluded: [v, edge] },
          pointers: { u, v },
          strips: strips(),
          phase: 'search',
        });
      }

      scene.countComparison();
      const isRoot = low.get(u) === index.get(u);
      yield scene.frame({
        codeLine: LINE.rootTest,
        explanation: isRoot
          ? `Every edge of ${name(u)} is done and low[${name(u)}] = index[${name(u)}] = ${index.get(u)}: nothing below ${name(u)} reaches above it. ${name(u)} is the root of a component.`
          : `Every edge of ${name(u)} is done, but low[${name(u)}] = ${low.get(u)} < index ${index.get(u)}: it reaches an ancestor, so it stays on the stack and returns${parent === null ? '' : ` to ${name(parent)}`}.`,
        highlights: isRoot ? { pivot: [u] } : { active: [u], visited: [`stack:${u}`] },
        pointers: { u },
        strips: strips(),
        phase: 'search',
      });

      if (isRoot) {
        const members: string[] = [];
        let w: string | undefined;
        do {
          w = stack.pop();
          if (w === undefined) throw new Error('stack emptied before reaching the root');
          onStack.delete(w);
          members.push(w);
          scene.bump('stack pops');
          const done = w === u;
          const tag = done ? scene.addComponent(members) : null;
          if (tag !== null) {
            closed.push(tag);
            scene.bump('components');
          }
          yield scene.frame({
            codeLine: done ? LINE.emit : LINE.pop,
            explanation: done
              ? `Pop ${name(w)}, the root. Component ${tag ?? ''}: { ${members.map(name).join(', ')} }, ${members.length === 1 ? 'a single node on no cycle' : `${members.length} nodes that all reach each other`}.`
              : `Pop ${name(w)}: it sits above ${name(u)} on the stack, so it joins ${name(u)}'s component.`,
            highlights: { active: [u], sorted: [...members] },
            pointers: { u, w },
            strips: strips(),
            phase: 'search',
          });
        } while (w !== u);
      }
      scene.popCall();
    }

    yield scene.frame({
      codeLine: LINE.outer,
      explanation: 'Every node starts with no index, shown as a dash. Each label will read index/low: when the node was discovered, and the earliest index it can reach.',
      strips: strips(),
      phase: 'search',
    });

    for (const u of scene.nodeIds) {
      if (index.has(u)) continue;
      if (index.size > 0) {
        yield scene.frame({
          codeLine: LINE.start,
          explanation: `${name(u)} has no index yet: nothing searched so far reaches it. Start a new search there.`,
          highlights: { candidate: [u] },
          pointers: { u },
          strips: strips(),
          phase: 'restart',
        });
      }
      yield* strongConnect(u, null);
    }

    const count = scene.componentCount;
    yield scene.frame({
      codeLine: 0,
      explanation:
        count === scene.nodeIds.length
          ? `Done: ${count} components, every one a single node. The graph has no cycle.`
          : count === 1
            ? `Done: one component. Every node reaches every other.`
            : `Done: ${count} components, closed in reverse topological order: no component has an edge into one found after it.`,
      strips: strips(),
      phase: 'done',
    });
  },
});
