/** Topological sort: Kahn's in-degree peeling, or DFS post-order, and what each does when there is a cycle. */

import { defineAlgorithm, type FieldSpec, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
import {
  buildGraph,
  directedOnlyField,
  edgesField,
  formatEdgeList,
  graphSizeOf,
  layoutField,
  MAX_GRAPH_EDGES,
  MAX_GRAPH_NODES,
  parseDirected,
  parseEdgeList,
  parseLayout,
  parsePositions,
  regenerating,
  seedField,
  type EdgeListEdge,
} from '../../core/graphInput';
import { GraphScene, edgeRef } from '../../core/graphScene';
import { randomInt } from '../../core/random';
import type { Frame, Graph, Strip } from '../../core/types';

type Method = 'kahn' | 'dfs';

interface TopoInput {
  readonly graph: Graph;
  readonly method: Method;
}

const CODE = `function kahn(): Node[] | null {
  const indegree = countIncomingEdges();         // how many prerequisites each node still has
  const ready = nodes.filter((u) => indegree[u] === 0);
  const order: Node[] = [];
  while (ready.length > 0) {
    const u = takeSmallest(ready);               // any ready node is valid; smallest id keeps runs reproducible
    order.push(u);
    for (const v of neighbours(u)) {
      indegree[v] -= 1;                          // u is placed: one fewer prerequisite for v
      if (indegree[v] === 0) ready.push(v);      // v has nothing left to wait for
    }
  }
  if (order.length < nodes.length) return null;  // the rest wait on each other: a cycle
  return order;
}

function dfsOrder(): Node[] | null {
  for (const s of nodes) {
    if (state[s] === undefined && !visit(s)) return null;
  }
  return order;                                  // built back to front
}

function visit(u: Node): boolean {
  state[u] = 'open';                             // on the stack
  for (const v of neighbours(u)) {
    if (state[v] === 'open') return false;       // back edge: v is an ancestor of u, a cycle
    if (state[v] === undefined && !visit(v)) return false;
  }
  state[u] = 'done';
  order.unshift(u);                              // finished: everything reachable from u is already placed after it
  return true;
}`;

const CODE_LINES = CODE.split('\n');
/** 1-based line of the first code line containing `text`; the frames point at code by content, so edits cannot drift. */
function lineOf(text: string): number {
  const at = CODE_LINES.findIndex((line) => line.includes(text));
  if (at < 0) throw new Error(`no code line contains ${text}`);
  return at + 1;
}

const LINE = {
  count: lineOf('countIncomingEdges'),
  ready: lineOf('nodes.filter'),
  take: lineOf('takeSmallest'),
  decrement: lineOf('indegree[v] -= 1'),
  enqueue: lineOf('ready.push(v)'),
  kahnCycle: lineOf('order.length < nodes.length'),
  // The first `return order;` is Kahn's; the DFS one is found by its comment.
  kahnDone: lineOf('return order;'),
  restart: lineOf("state[s] === undefined"),
  dfsDone: lineOf('built back to front'),
  open: lineOf("state[u] = 'open'"),
  backEdge: lineOf("state[v] === 'open'"),
  recurse: lineOf('!visit(v)'),
  finish: lineOf('order.unshift(u)'),
} as const;

export const UNDIRECTED_ERROR =
  'A topological order is defined for directed graphs. Switch "Edges are" to Directed. An undirected edge points both ways, which is already a cycle of two.';

const methodField: FieldSpec = {
  key: 'method',
  label: 'Method',
  kind: 'select',
  defaultValue: 'kahn',
  options: [
    { value: 'kahn', label: "Kahn's: peel off nodes with in-degree 0" },
    { value: 'dfs', label: 'DFS: reverse post-order' },
  ],
};

function parse(params: ParamMap): ParseResult<TopoInput> {
  if (!parseDirected(params.directed)) return { ok: false, error: UNDIRECTED_ERROR };
  const list = parseEdgeList(params.g ?? '', { directed: true });
  if (!list.ok) return list;
  return {
    ok: true,
    value: { graph: buildGraph(list.value, true, parseLayout(params.layout), parsePositions(params.pos, list.value.nodeCount)), method: params.method === 'dfs' ? 'dfs' : 'kahn' },
  };
}

/* ---------------- presets: directed, edges from a lower id to a higher one unless a cycle is wanted ---------------- */

function finish(edges: readonly EdgeListEdge[], size: number, rng: () => number): ParamMap {
  const touched = new Set<number>();
  for (const edge of edges) {
    touched.add(edge.from);
    touched.add(edge.to);
  }
  const isolated = Array.from({ length: size }, (_, i) => i).filter((i) => !touched.has(i));
  return { g: formatEdgeList(edges.slice(0, MAX_GRAPH_EDGES), isolated), directed: '1', layout: 'auto', seed: String(randomInt(rng, 0, 999999)) };
}

/** Splits 0..size-1, in order, into consecutive levels of the given widths. */
function levelsOf(size: number, width: (level: number) => number): number[][] {
  const levels: number[][] = [];
  for (let at = 0; at < size; ) {
    const take = Math.max(1, Math.min(size - at, width(levels.length)));
    levels.push(Array.from({ length: take }, (_, i) => at + i));
    at += take;
  }
  return levels;
}

/** Every node past the first level gets one or two prerequisites from the level above, sometimes one from two above. */
function prerequisites(levels: readonly (readonly number[])[], rng: () => number): EdgeListEdge[] {
  const edges: EdgeListEdge[] = [];
  const seen = new Set<string>();
  const add = (from: number, to: number): void => {
    const key = `${from}>${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to });
  };
  for (let l = 1; l < levels.length; l++) {
    const above = levels[l - 1] ?? [];
    for (const node of levels[l] ?? []) {
      const wanted = randomInt(rng, 1, 2);
      for (let k = 0; k < wanted; k++) add(above[randomInt(rng, 0, above.length - 1)] ?? 0, node);
      const further = levels[l - 2];
      if (further !== undefined && randomInt(rng, 0, 4) === 0) add(further[randomInt(rng, 0, further.length - 1)] ?? 0, node);
    }
  }
  return edges;
}

function courses(size: number, rng: () => number): EdgeListEdge[] {
  const most = Math.max(2, Math.round(Math.sqrt(size)));
  return prerequisites(levelsOf(size, () => randomInt(rng, 2, most)), rng);
}

function wide(size: number, rng: () => number): EdgeListEdge[] {
  const depth = size < 12 ? 2 : size < 40 ? 3 : 4;
  return prerequisites(levelsOf(size, () => Math.ceil(size / depth)), rng);
}

function chain(size: number, rng: () => number): EdgeListEdge[] {
  const edges: EdgeListEdge[] = Array.from({ length: size - 1 }, (_, i) => ({ from: i, to: i + 1 }));
  for (let k = 0; k < Math.floor(size / 10); k++) {
    const from = randomInt(rng, 0, size - 3);
    const to = Math.min(size - 1, from + randomInt(rng, 2, 4));
    if (!edges.some((edge) => edge.from === from && edge.to === to)) edges.push({ from, to });
  }
  return edges;
}

/** Course prerequisites plus one edge back up a prerequisite path, so a few courses each wait on another. */
function withCycle(size: number, rng: () => number): EdgeListEdge[] {
  const edges = courses(size, rng);
  const into = new Map<number, number[]>();
  for (const edge of edges) into.set(edge.to, [...(into.get(edge.to) ?? []), edge.from]);
  // The highest node with a prerequisite of a prerequisite closes a cycle of three; failing that, a cycle of two.
  for (let node = size - 1; node >= 0; node--) {
    for (const parent of into.get(node) ?? []) {
      const grand = into.get(parent)?.[0];
      if (grand !== undefined) return [...edges, { from: node, to: grand }];
    }
  }
  const first = edges[0] ?? { from: 0, to: 1 };
  return [...edges, { from: first.to, to: first.from }];
}

export const TOPO_PRESETS: readonly PresetSpec[] = regenerating([
  { id: 'courses', label: 'Course prerequisites', build: (size, rng) => finish(courses(size, rng), size, rng) },
  { id: 'wide', label: 'Wide and shallow', build: (size, rng) => finish(wide(size, rng), size, rng) },
  { id: 'chain', label: 'Long chain', build: (size, rng) => finish(chain(size, rng), size, rng) },
  { id: 'cycle', label: 'With a cycle', build: (size, rng) => finish(withCycle(size, rng), size, rng) },
]);

/** Phase of the closing frame when the graph has a cycle. */
export const NOT_A_DAG = 'not a DAG';

/**
 * Splits the nodes Kahn's could not place into those on a cycle and those that
 * only wait on one. A stuck node is on a cycle exactly when it can reach itself
 * through other stuck nodes (its strongly connected component has more than one
 * node; the edge list rejects self-loops). One search per stuck node, run once.
 */
export function splitStuck(graph: Graph, stuck: readonly string[]): { readonly onCycle: string[]; readonly downstream: string[] } {
  const inside = new Set(stuck);
  const out = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (inside.has(edge.from) && inside.has(edge.to)) out.set(edge.from, [...(out.get(edge.from) ?? []), edge.to]);
  }
  const returns = (start: string): boolean => {
    const seen = new Set<string>();
    const queue = [...(out.get(start) ?? [])];
    for (let head = 0; head < queue.length; head++) {
      const node = queue[head] ?? '';
      if (node === start) return true;
      if (seen.has(node)) continue;
      seen.add(node);
      queue.push(...(out.get(node) ?? []));
    }
    return false;
  };
  const onCycle = stuck.filter(returns);
  const cyclic = new Set(onCycle);
  return { onCycle, downstream: stuck.filter((id) => !cyclic.has(id)) };
}

/** "7, 9 and 11", or the first few and a count once the list gets long. */
function listOf(names: readonly string[], most = 12): string {
  if (names.length > most) return `${names.slice(0, most).join(', ')} and ${names.length - most} more`;
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

type Gen = Generator<Frame, void, undefined>;

export const topologicalSort = defineAlgorithm<TopoInput>({
  meta: {
    id: 'topological-sort',
    name: 'Topological sort',
    category: 'graphs',
    structureKind: 'graph',
    blurb: "Kahn's in-degree peeling next to the DFS post-order variant.",
    complexity: {
      time: { best: 'O(V + E)', average: 'O(V + E)', worst: 'O(V + E)' },
      space: 'O(V)',
      notes: [
        'An order of the nodes in which every edge points forward: for each edge u -> v, u comes before v. One exists exactly when the graph has no directed cycle.',
        "Kahn's keeps a set of nodes nothing points into any more. Placing one removes its outgoing edges, which can free others. If the set empties before every node is placed, the rest wait on each other: a cycle.",
        'The DFS variant places a node when it finishes, at the front of the order: by then everything reachable from it is already placed after it. Meeting a node that is still on the stack means an edge back to an ancestor, which closes a cycle.',
        'A graph usually has many valid orders. Taking the smallest ready id, and scanning neighbours by id, picks one and makes every run reproducible.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'recursiveCalls'],
  },
  fields: [edgesField('0-1,0-2,1-3,2-3,1-4,3-5,4-5,4-6,2-7,3-7,5-8,6-8', false), directedOnlyField, methodField, layoutField, seedField],
  presets: TOPO_PRESETS,
  sizeRange: { min: 4, max: MAX_GRAPH_NODES, step: 1 },
  sizeOf: graphSizeOf,
  parse,
  *run(input) {
    if (input.method === 'dfs') yield* runDfs(input.graph);
    else yield* runKahn(input.graph);
  },
});

function* runKahn(graph: Graph): Gen {
  const scene = new GraphScene(graph, { visitedCounter: 'nodes placed' });
  const name = (id: string): string => scene.label(id);
  const indegree = new Map<string, number>(scene.nodeIds.map((id) => [id, 0]));
  for (const id of scene.nodeIds) {
    for (const neighbour of scene.neighbours(id)) indegree.set(neighbour.to, (indegree.get(neighbour.to) ?? 0) + 1);
  }
  for (const id of scene.nodeIds) scene.setLabel(id, String(indegree.get(id) ?? 0));
  const byId = (a: string, b: string): number => Number(a) - Number(b);
  const ready = scene.nodeIds.filter((id) => indegree.get(id) === 0).sort(byId);
  const order: string[] = [];
  const strips = (): readonly Strip[] => [scene.strip('pq', 'ready', ready), scene.strip('output', 'order', order)];

  yield scene.frame({
    codeLine: LINE.count,
    explanation: `Each label is a node's in-degree: how many edges point into it, so how many prerequisites it still waits on. ${scene.nodeIds.length} nodes, ${graph.edges.length} edges.`,
    strips: strips(),
    phase: 'count',
  });
  yield scene.frame({
    codeLine: LINE.ready,
    explanation:
      ready.length === 0
        ? 'No node has in-degree 0: every node waits on another, so there is nowhere to start.'
        : `${ready.length === 1 ? `Only ${name(ready[0] ?? '')} has` : `${ready.length} nodes have`} in-degree 0: nothing has to come before ${ready.length === 1 ? 'it' : 'them'}, so ${ready.length === 1 ? 'it is' : 'they are'} ready.`,
    highlights: { candidate: [...ready, ...ready.map((id) => `pq:${id}`)] },
    strips: strips(),
    phase: 'peel',
  });

  while (ready.length > 0) {
    const choices = ready.length;
    const u = ready.shift() ?? '';
    scene.countComparison(choices - 1);
    order.push(u);
    scene.visit(u);
    yield scene.frame({
      codeLine: LINE.take,
      explanation:
        choices > 1
          ? `${choices} nodes are ready, and any of them could go next: a graph can have many valid topological orders, and this run builds one of them. It takes the smallest id, ${name(u)}, so the run is reproducible.`
          : `${name(u)} is the only ready node. Place it: position ${order.length}.`,
      highlights: { active: [u, `output:${u}`] },
      pointers: { u },
      strips: strips(),
      phase: 'peel',
    });

    for (const neighbour of scene.neighbours(u)) {
      const v = scene.examine(neighbour);
      const edge = edgeRef(neighbour.edge);
      const left = (indegree.get(v) ?? 0) - 1;
      indegree.set(v, left);
      scene.setLabel(v, String(left));
      scene.bump('in-degree updates');
      scene.countComparison();
      if (left === 0) {
        ready.push(v);
        ready.sort(byId);
      }
      yield scene.frame({
        codeLine: left === 0 ? LINE.enqueue : LINE.decrement,
        explanation:
          left === 0
            ? `${name(u)} -> ${name(v)}: with ${name(u)} placed, ${name(v)} has nothing left to wait for. In-degree 0, so ${name(v)} is ready.`
            : `${name(u)} -> ${name(v)}: ${name(u)} is placed, so ${name(v)} waits on one fewer node. In-degree ${left + 1} -> ${left}.`,
        highlights: { active: [u], candidate: left === 0 ? [v, edge, `pq:${v}`] : [v, edge] },
        pointers: { u, v },
        strips: strips(),
        phase: 'peel',
      });
    }
  }

  if (order.length < scene.nodeIds.length) {
    const placed = new Set(order);
    const stuck = scene.nodeIds.filter((id) => !placed.has(id));
    const stuckSet = new Set(stuck);
    const between = graph.edges.filter((edge) => stuckSet.has(edge.from) && stuckSet.has(edge.to)).map(edgeRef);
    const { onCycle, downstream } = splitStuck(graph, stuck);
    const split =
      downstream.length === 0
        ? `All of them are on a cycle.`
        : `On a cycle: ${listOf(onCycle.map(name))}. Only waiting on one: ${listOf(downstream.map(name))}.`;
    yield scene.frame({
      codeLine: LINE.kahnCycle,
      explanation: `Not a DAG: no topological order exists. The ready set is empty with ${stuck.length} node${stuck.length === 1 ? '' : 's'} unplaced. These nodes are on a cycle or depend on one, so none of them can ever reach in-degree 0. ${split}`,
      highlights: { swapped: [...stuck, ...between] },
      strips: strips(),
      phase: NOT_A_DAG,
    });
    return;
  }
  yield scene.frame({
    codeLine: LINE.kahnDone,
    explanation: `Done: all ${order.length} nodes placed, and every edge points forward in this order. Other valid orders exist whenever more than one node was ready at once.`,
    highlights: { sorted: [...order] },
    strips: strips(),
    phase: 'done',
  });
}

function* runDfs(graph: Graph): Gen {
  const scene = new GraphScene(graph);
  const name = (id: string): string => scene.label(id);
  const path: string[] = [];
  const onPath = new Set<string>();
  const order: string[] = [];
  let time = 0;
  let cycle: { readonly from: string; readonly to: string; readonly edge: string } | null = null;
  const strips = (): readonly Strip[] => [scene.strip('stack', 'stack', path), scene.strip('output', 'order', order)];

  /** False once a back edge is found; the recursion then unwinds without frames. */
  function* visit(u: string, parent: string | null): Generator<Frame, boolean, undefined> {
    scene.countCall();
    scene.pushCall({ label: `visit(${name(u)})`, codeLine: LINE.open });
    path.push(u);
    onPath.add(u);
    scene.visit(u);
    time += 1;
    const disc = time;
    scene.setLabel(u, `${disc}/`);
    yield scene.frame({
      codeLine: LINE.open,
      explanation:
        parent === null
          ? `visit(${name(u)}): open at time ${disc}. It stays on the stack until everything reachable from it is placed.`
          : `visit(${name(u)}), from ${name(parent)}: open at time ${disc}.`,
      highlights: { active: [u], sorted: [`stack:${u}`] },
      pointers: { u },
      strips: strips(),
      phase: 'search',
    });

    for (const neighbour of scene.neighbours(u)) {
      const v = scene.examine(neighbour);
      const edge = edgeRef(neighbour.edge);
      scene.countComparison();
      if (onPath.has(v)) {
        cycle = { from: u, to: v, edge };
        const loop = path.slice(path.indexOf(v));
        yield scene.frame({
          codeLine: LINE.backEdge,
          explanation: `${name(u)} -> ${name(v)}: ${name(v)} is still open, on the stack below ${name(u)}. That edge points back to an ancestor, closing the cycle ${[...loop, v].map(name).join(' -> ')}.`,
          highlights: { active: [u], swapped: [edge, ...loop] },
          pointers: { u, v },
          strips: strips(),
          phase: 'search',
        });
        path.pop();
        onPath.delete(u);
        scene.popCall();
        return false;
      }
      if (scene.isVisited(v)) {
        yield scene.frame({
          codeLine: LINE.recurse,
          explanation: `${name(u)} -> ${name(v)}: ${name(v)} is already finished and placed. ${name(u)} will go in front of it, so this edge points forward. Skip.`,
          highlights: { active: [u], excluded: [v, edge] },
          pointers: { u, v },
          strips: strips(),
          phase: 'search',
        });
        continue;
      }
      scene.setTreeEdge(neighbour.edge);
      yield scene.frame({
        codeLine: LINE.recurse,
        explanation: `${name(u)} -> ${name(v)}: ${name(v)} is new. Visit it first; ${name(u)} can only be placed once everything after it is.`,
        highlights: { active: [u], candidate: [v, edge] },
        pointers: { u, v },
        strips: strips(),
        phase: 'search',
      });
      if (!(yield* visit(v, u))) {
        path.pop();
        onPath.delete(u);
        scene.popCall();
        return false;
      }
    }

    time += 1;
    scene.setLabel(u, `${disc}/${time}`);
    order.unshift(u);
    path.pop();
    onPath.delete(u);
    scene.popCall();
    yield scene.frame({
      codeLine: LINE.finish,
      explanation: `${name(u)} finishes at time ${time}: everything reachable from it is placed, so it goes to the front of the order.`,
      highlights: { sorted: [u, `output:${u}`], ...(parent === null ? {} : { active: [parent] }) },
      pointers: parent === null ? { u } : { u, parent },
      strips: strips(),
      phase: 'search',
    });
    return true;
  }

  for (const s of scene.nodeIds) {
    if (scene.isVisited(s)) continue;
    if (scene.visitedCount > 0) {
      yield scene.frame({
        codeLine: LINE.restart,
        explanation: `${name(s)} is unvisited: nothing visited so far reaches it. Start a new search there; it will land in front of everything placed so far.`,
        highlights: { candidate: [s] },
        pointers: { s },
        strips: strips(),
        phase: 'restart',
      });
    }
    if (!(yield* visit(s, null))) break;
  }

  const found = cycle as { readonly from: string; readonly to: string; readonly edge: string } | null;
  if (found !== null) {
    yield scene.frame({
      codeLine: LINE.backEdge,
      explanation: `Not a DAG: no topological order exists. The edge ${name(found.from)} -> ${name(found.to)} points back to a node that was still open, so ${name(found.to)} would have to come both before and after ${name(found.from)}.`,
      highlights: { swapped: [found.edge, found.from, found.to] },
      strips: strips(),
      phase: NOT_A_DAG,
    });
    return;
  }
  yield scene.frame({
    codeLine: LINE.dfsDone,
    explanation: `Done: every node finished, and the order is reverse finishing time, so every edge points forward. Other valid orders exist; this one follows the id order of the scans.`,
    highlights: { sorted: [...order] },
    strips: strips(),
    phase: 'done',
  });
}
