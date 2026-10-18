/** Bellman-Ford: relax every edge, pass after pass, in one fixed order; then one more pass to catch a negative cycle. */

import { defineAlgorithm, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
import {
  buildGraph,
  directedOnlyField,
  edgesField,
  formatEdgeList,
  graphSizeOf,
  layoutField,
  MAX_GRAPH_NODES,
  parseDirected,
  parseEdgeList,
  parseLayout,
  parseStart,
  seedField,
  startField,
  type EdgeListEdge,
} from '../../core/graphInput';
import { GraphScene, edgeRef } from '../../core/graphScene';
import { randomInt, shuffle } from '../../core/random';
import type { Frame, Graph, GraphEdge, Strip } from '../../core/types';

interface BellmanFordInput {
  readonly graph: Graph;
  readonly start: string;
}

const CODE = `function bellmanFord(start: Node): boolean {
  for (const v of nodes) dist[v] = Infinity;
  dist[start] = 0;
  for (let pass = 1; pass <= nodes.length - 1; pass++) {
    let changed = false;
    for (const [u, v, w] of edges) {             // the same fixed order every pass
      if (dist[u] + w < dist[v]) {               // relax: a shorter way to v, through u
        dist[v] = dist[u] + w;
        prev[v] = u;
        changed = true;
      }
    }
    if (!changed) return true;                   // a pass that changes nothing: every distance is final
  }
  for (const [u, v, w] of edges) {               // one more pass, only to check
    if (dist[u] + w < dist[v]) {                 // still improving after V-1 passes
      prev[v] = u;
      let x = v;
      for (let i = 0; i < nodes.length; i++) x = prev[x];   // V steps back lands inside the cycle
      return false;                              // follow prev from x until x again: the negative cycle
    }
  }
  return true;
}`;

const CODE_LINES = CODE.split('\n');
function lineOf(text: string): number {
  const at = CODE_LINES.findIndex((line) => line.includes(text));
  if (at < 0) throw new Error(`no code line contains ${text}`);
  return at + 1;
}

const LINE = {
  init: lineOf('dist[start] = 0'),
  pass: lineOf('let pass = 1'),
  test: lineOf('the same fixed order'),
  relax: lineOf('prev[v] = u;'),
  early: lineOf('if (!changed)'),
  check: lineOf('only to check'),
  still: lineOf('still improving'),
  walk: lineOf('V steps back'),
  cycle: lineOf('follow prev from x'),
} as const;

export const UNDIRECTED_ERROR =
  'Bellman-Ford is defined here for directed graphs. Switch "Edges are" to Directed. In an undirected graph a negative edge is itself a negative cycle: walking it there and back lowers the cost forever.';

function parse(params: ParamMap): ParseResult<BellmanFordInput> {
  if (!parseDirected(params.directed)) return { ok: false, error: UNDIRECTED_ERROR };
  const list = parseEdgeList(params.g ?? '', { directed: true, requireWeights: true });
  if (!list.ok) return list;
  const start = parseStart(params.start, list.value.nodeCount);
  if (!start.ok) return start;
  return { ok: true, value: { graph: buildGraph(list.value, true, parseLayout(params.layout)), start: String(start.value) } };
}

/** Distances and weights as shown: ∞ until reached, and a true minus sign, which stays legible where a hyphen thins out. */
function fmt(value: number): string {
  if (!Number.isFinite(value)) return '∞';
  const rounded = Math.round(value * 100) / 100;
  return rounded < 0 ? `−${-rounded}` : String(rounded);
}

/* ---------------- presets: directed and weighted; the edge order is part of the input ---------------- */

function finish(edges: readonly EdgeListEdge[], size: number, rng: () => number): ParamMap {
  const touched = new Set<number>();
  for (const edge of edges) {
    touched.add(edge.from);
    touched.add(edge.to);
  }
  const isolated = Array.from({ length: size }, (_, i) => i).filter((i) => !touched.has(i));
  return { g: formatEdgeList(edges, isolated), directed: '1', start: '0', layout: 'auto', seed: String(randomInt(rng, 0, 999999)) };
}

/** Edges from a lower id to a higher one only, so no cycle of any sign: a tree from 0 plus extra forward edges. */
function forward(size: number, from: number, rng: () => number, weight: () => number): EdgeListEdge[] {
  const edges: EdgeListEdge[] = [];
  const seen = new Set<string>();
  const add = (a: number, b: number): void => {
    if (a === b || seen.has(`${a}>${b}`)) return;
    seen.add(`${a}>${b}`);
    edges.push({ from: a, to: b, weight: weight() });
  };
  for (let i = from; i < size; i++) add(randomInt(rng, Math.max(0, i - 4), i - 1), i);
  for (let extra = Math.round((size - from) * 0.5), tries = 0; extra > 0 && tries < size * 20; tries++) {
    const a = randomInt(rng, 0, size - 2);
    const before = edges.length;
    add(a, randomInt(rng, a + 1, Math.min(size - 1, a + 6)));
    if (edges.length > before) extra -= 1;
  }
  return edges;
}

function negativeNoCycle(size: number, rng: () => number): EdgeListEdge[] {
  // Shuffled, so distances settle over several passes rather than in the first.
  return shuffle(forward(size, 1, rng, () => randomInt(rng, -4, 9)), rng);
}

/**
 * 0 -> 1 costs 2 and 0 -> 2 costs 5, but 2 -> 1 costs -4. Dijkstra settles 1 at
 * 2 before it looks at 2, and never revisits it; the real distance is 1, and
 * everything reached through 1 inherits the error.
 */
function dijkstraTrap(size: number, rng: () => number): EdgeListEdge[] {
  const gadget: EdgeListEdge[] = [
    { from: 0, to: 1, weight: 2 },
    { from: 0, to: 2, weight: 5 },
    { from: 2, to: 1, weight: -4 },
  ];
  // The rest hang off 1 or later nodes with positive weights, never touching 0 or 2, so every one of them
  // is reached through 1 and inherits its error, and nothing leads back to 2 to close a cycle with 2 -> 1.
  const rest: EdgeListEdge[] = [];
  const seen = new Set<string>();
  const pool = (below: number): number[] => [1, ...Array.from({ length: Math.max(0, below - 3) }, (_, k) => k + 3)];
  for (let i = 3; i < size; i++) {
    const from = pool(i);
    const parent = from[randomInt(rng, Math.max(0, from.length - 4), from.length - 1)] ?? 1;
    seen.add(`${parent}>${i}`);
    rest.push({ from: parent, to: i, weight: randomInt(rng, 1, 9) });
  }
  for (let extra = Math.round((size - 3) * 0.5), tries = 0; extra > 0 && tries < size * 20; tries++) {
    const from = pool(size - 1);
    const a = from[randomInt(rng, 0, from.length - 1)] ?? 1;
    const b = Math.max(3, randomInt(rng, a + 1, Math.min(size - 1, a + 6)));
    if (b <= a || b >= size || seen.has(`${a}>${b}`)) continue;
    seen.add(`${a}>${b}`);
    rest.push({ from: a, to: b, weight: randomInt(rng, 1, 9) });
    extra -= 1;
  }
  return shuffle([...gadget, ...rest], rng);
}

/** A forward graph plus a cycle a -> b -> c -> a of total weight -2, reachable from 0. */
function negativeCycle(size: number, rng: () => number): EdgeListEdge[] {
  const a = Math.max(1, Math.floor(size / 3));
  const b = a + 1;
  const c = Math.min(size - 1, a + 2);
  const base = forward(size, 1, rng, () => randomInt(rng, 1, 9)).filter((edge) => !(edge.from === a && edge.to === b) && !(edge.from === b && edge.to === c));
  const cycle: EdgeListEdge[] = [
    { from: a, to: b, weight: 2 },
    { from: b, to: c, weight: -3 },
    { from: c, to: a, weight: -1 },
  ];
  return shuffle([...base, ...cycle], rng);
}

/** Every edge listed after the edge that reaches its source, so pass 1 finds every distance and pass 2 proves it by changing nothing. */
function correctAfterOnePass(size: number, rng: () => number): EdgeListEdge[] {
  return forward(size, 1, rng, () => randomInt(rng, -3, 9)).sort((x, y) => x.from - y.from || x.to - y.to);
}

export const BELLMAN_FORD_PRESETS: readonly PresetSpec[] = [
  { id: 'negative', label: 'Negative edges', build: (size, rng) => finish(negativeNoCycle(size, rng), size, rng), description: 'some weights are negative, but no cycle exists, so every shortest path is defined.' },
  {
    id: 'dijkstra-fails',
    label: 'Dijkstra fails here',
    build: (size, rng) => finish(dijkstraTrap(size, rng), size, rng),
    description: 'Dijkstra would settle node 1 at 2 and never revisit it, but 0 → 2 → 1 costs 5 − 4 = 1, and every node reached through 1 would be off too. Bellman-Ford keeps relaxing and gets 1.',
  },
  { id: 'negative-cycle', label: 'Negative cycle', build: (size, rng) => finish(negativeCycle(size, rng), size, rng), description: 'a cycle of total weight −2 is reachable from 0, so shortest paths are undefined; the check pass finds it.' },
  {
    id: 'one-pass',
    label: 'Correct after one pass',
    build: (size, rng) => finish(correctAfterOnePass(size, rng), size, rng),
    description: 'edges are listed source-first, so pass 1 already finds every distance. Pass 2 is what proves it: it changes nothing, and the run stops there.',
  },
];

/** Phase of the closing frame when a negative cycle is reachable. */
export const NEGATIVE_CYCLE = 'negative cycle';

type Gen = Generator<Frame, void, undefined>;

export const bellmanFord = defineAlgorithm<BellmanFordInput>({
  meta: {
    id: 'bellman-ford',
    name: 'Bellman-Ford',
    category: 'graphs',
    structureKind: 'graph',
    blurb: 'Relax every edge V-1 times, then detect negative cycles.',
    complexity: {
      time: { best: 'O(E)', average: 'O(V E)', worst: 'O(V E)' },
      space: 'O(V)',
      notes: [
        'After pass k, every node whose shortest path uses at most k edges has its final distance. A shortest path without a cycle has at most V-1 edges, so V-1 passes are enough whatever the weights, negative ones included.',
        'Edges are relaxed in one fixed order, the order they are listed in. A good order finishes in a pass or two; the worst order needs all V-1. A pass that changes nothing means every distance is final, so the run stops there.',
        'If an edge still relaxes after V-1 passes, a negative cycle is reachable: going round it again lowers the cost forever. Walking prev V times from that edge lands inside the cycle, and following prev from there traces it.',
        'Dijkstra is faster, O(E log V), but it settles each node once and never revisits it, which is only safe when no weight is negative.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons'],
  },
  fields: [edgesField('3-4:2,2-3:-2,1-2:3,0-1:4,0-2:6,1-3:5,4-5:-1,2-5:4,0-6:1,6-5:2', true), directedOnlyField, startField, layoutField, seedField],
  presets: BELLMAN_FORD_PRESETS,
  sizeRange: { min: 4, max: MAX_GRAPH_NODES, step: 1 },
  sizeOf: graphSizeOf,
  parse,
  *run(input) {
    yield* runBellmanFord(input.graph, input.start);
  },
});

function* runBellmanFord(graph: Graph, start: string): Gen {
  const scene = new GraphScene(graph, { visitedCounter: 'nodes reached' });
  const name = (id: string): string => scene.label(id);
  const edges = graph.edges;
  const n = scene.nodeIds.length;
  const dist = new Map<string, number>(scene.nodeIds.map((id) => [id, Number.POSITIVE_INFINITY]));
  const prev = new Map<string, GraphEdge>();
  for (const id of scene.nodeIds) scene.setLabel(id, '∞');

  // The rest of a pass from edge i, built once and shared by every pass and frame.
  const chips = edges.map((edge) => ({ id: edge.id, label: `${name(edge.from)}→${name(edge.to)}` }));
  const rest: readonly Strip[] = edges.map((_, i) => Object.freeze({ label: 'edge order', kind: 'queue' as const, items: Object.freeze(chips.slice(i)) }));
  const none: Strip = Object.freeze({ label: 'edge order', kind: 'queue' as const, items: Object.freeze([]) });
  const stripsAt = (i: number): readonly Strip[] => [rest[i] ?? none];
  const full = (): readonly Strip[] => [rest[0] ?? none];

  const relax = (edge: GraphEdge, value: number): void => {
    const old = prev.get(edge.to);
    if (old !== undefined) scene.setTreeEdge(old, false);
    prev.set(edge.to, edge);
    scene.setTreeEdge(edge);
    dist.set(edge.to, value);
    scene.setLabel(edge.to, fmt(value));
    scene.visit(edge.to);
  };

  dist.set(start, 0);
  scene.setLabel(start, '0');
  scene.visit(start);
  yield scene.frame({
    codeLine: LINE.init,
    explanation: `bellmanFord(${name(start)}): every distance starts at ∞ except the start at 0. Each pass relaxes all ${edges.length} edges in the order shown, at most ${n - 1} passes.`,
    highlights: { active: [start] },
    pointers: { start },
    strips: full(),
    phase: `pass 1 of ${n - 1}`,
  });

  for (let pass = 1; pass <= n - 1; pass++) {
    scene.bump('passes');
    const phase = `pass ${pass} of ${n - 1}`;
    let changed = 0;
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i] as GraphEdge;
      const { from: u, to: v } = edge;
      const w = edge.weight ?? 0;
      const ref = edgeRef(edge);
      const du = dist.get(u) ?? Number.POSITIVE_INFINITY;
      const dv = dist.get(v) ?? Number.POSITIVE_INFINITY;
      const candidate = du + w;
      scene.bump('edges examined');
      scene.countComparison();
      const label = `${name(u)}→${name(v)} (${fmt(w)})`;
      if (!Number.isFinite(du)) {
        yield scene.frame({
          codeLine: LINE.test,
          explanation: `${label}: ${name(u)} is not reached yet, dist ∞, so there is nothing to carry over to ${name(v)}.`,
          highlights: { excluded: [ref], active: [`queue:${edge.id}`] },
          pointers: { u, v },
          strips: stripsAt(i),
          phase,
        });
        continue;
      }
      if (candidate < dv) {
        changed += 1;
        relax(edge, candidate);
        scene.bump('relaxations');
        yield scene.frame({
          codeLine: LINE.relax,
          explanation: Number.isFinite(dv)
            ? `${label}: ${fmt(du)} + ${fmt(w)} = ${fmt(candidate)} beats ${fmt(dv)}. Relax: ${name(v)} now hangs off ${name(u)}.`
            : `${label}: first way to ${name(v)}, at ${fmt(du)} + ${fmt(w)} = ${fmt(candidate)}. ${name(v)} hangs off ${name(u)}.`,
          highlights: { active: [u, `queue:${edge.id}`], candidate: [v, ref] },
          pointers: { u, v },
          strips: stripsAt(i),
          phase,
        });
        continue;
      }
      yield scene.frame({
        codeLine: LINE.test,
        explanation: `${label}: ${fmt(du)} + ${fmt(w)} = ${fmt(candidate)}, no better than the ${fmt(dv)} already known for ${name(v)}.`,
        highlights: { active: [u, `queue:${edge.id}`], excluded: [ref] },
        pointers: { u, v },
        strips: stripsAt(i),
        phase,
      });
    }

    if (changed === 0) {
      yield scene.frame({
        codeLine: LINE.early,
        explanation: `Pass ${pass} relaxed nothing, so no distance can change again: every one is final. Stop after ${pass} of the ${n - 1} passes allowed. A pass that changes nothing also rules out a reachable negative cycle, so no check pass is needed.`,
        highlights: { sorted: scene.nodeIds.filter((id) => Number.isFinite(dist.get(id) ?? Number.POSITIVE_INFINITY)) },
        strips: [none],
        phase: 'done',
      });
      return;
    }
    if (pass < n - 1) {
      yield scene.frame({
        codeLine: LINE.pass,
        explanation: `Pass ${pass} relaxed ${changed} edge${changed === 1 ? '' : 's'}, so something may still improve. Pass ${pass + 1}, same order.`,
        strips: full(),
        phase: `pass ${pass + 1} of ${n - 1}`,
      });
    }
  }

  yield scene.frame({
    codeLine: LINE.check,
    explanation: `${n - 1} passes done, the most a path without a cycle can need. One more pass, only to check: if any edge still relaxes, a negative cycle is reachable.`,
    strips: full(),
    phase: 'check',
  });
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i] as GraphEdge;
    const { from: u, to: v } = edge;
    const w = edge.weight ?? 0;
    const ref = edgeRef(edge);
    const du = dist.get(u) ?? Number.POSITIVE_INFINITY;
    const dv = dist.get(v) ?? Number.POSITIVE_INFINITY;
    scene.bump('edges examined');
    scene.countComparison();
    const label = `${name(u)}→${name(v)} (${fmt(w)})`;
    if (!(Number.isFinite(du) && du + w < dv)) {
      yield scene.frame({
        codeLine: LINE.check,
        explanation: `${label}: ${Number.isFinite(du) ? `${fmt(du)} + ${fmt(w)} = ${fmt(du + w)}, not below ${fmt(dv)}` : `${name(u)} is unreached`}. Holds.`,
        highlights: { active: [`queue:${edge.id}`], excluded: [ref] },
        pointers: { u, v },
        strips: stripsAt(i),
        phase: 'check',
      });
      continue;
    }

    relax(edge, du + w);
    yield scene.frame({
      codeLine: LINE.still,
      explanation: `${label}: ${fmt(du)} + ${fmt(w)} = ${fmt(du + w)} still beats ${fmt(dv)} after ${n - 1} passes. Only a negative cycle can keep lowering a distance, so one is reachable. To find it, walk prev back ${n} times from ${name(v)}.`,
      highlights: { swapped: [ref], active: [v, `queue:${edge.id}`] },
      pointers: { u, v },
      strips: stripsAt(i),
      phase: 'check',
    });

    let x = v;
    for (let step = 1; step <= n; step++) {
      const back = prev.get(x);
      if (back === undefined) throw new Error(`no prev for ${x} while walking back`);
      x = back.from;
      yield scene.frame({
        codeLine: LINE.walk,
        explanation:
          step < n
            ? `Step ${step} of ${n}: x = prev[x] = ${name(x)}.`
            : `Step ${n} of ${n}: x = ${name(x)}. After ${n} steps back the walk has gone round more times than there are nodes outside the cycle, so ${name(x)} is on it.`,
        highlights: { active: [x], candidate: [edgeRef(back)] },
        pointers: { x },
        strips: [none],
        phase: 'walk prev',
      });
    }

    const loopNodes: string[] = [x];
    const loopEdges: GraphEdge[] = [];
    for (let at = x; ; ) {
      const back = prev.get(at);
      if (back === undefined) throw new Error('prev chain broke inside the cycle');
      loopEdges.unshift(back);
      at = back.from;
      if (at === x) break;
      loopNodes.unshift(at);
    }
    const total = loopEdges.reduce((sum, e) => sum + (e.weight ?? 0), 0);
    const loopText = [...loopNodes, loopNodes[0] ?? x].map(name).join(' → ');
    const cycleMarks = [...loopNodes, ...loopEdges.map(edgeRef)];
    yield scene.frame({
      codeLine: LINE.cycle,
      explanation: `Follow prev from ${name(x)} until it comes back: ${loopText}, total weight ${fmt(total)}. Every lap lowers each distance on it by ${fmt(-total)} again.`,
      highlights: { swapped: cycleMarks },
      strips: [none],
      phase: 'walk prev',
    });
    yield scene.frame({
      codeLine: LINE.cycle,
      explanation: `Negative cycle: shortest paths are undefined. ${loopText} costs ${fmt(total)}, and anything reachable from it can be made as cheap as you like by going round again first.`,
      highlights: { swapped: cycleMarks },
      strips: [none],
      phase: NEGATIVE_CYCLE,
    });
    return;
  }

  const unreached = scene.nodeIds.filter((id) => !Number.isFinite(dist.get(id) ?? Number.POSITIVE_INFINITY));
  yield scene.frame({
    codeLine: 0,
    explanation: `The check pass relaxed nothing: no negative cycle is reachable, and every distance is final.${unreached.length === 0 ? '' : ` ${unreached.length} node${unreached.length === 1 ? ' is' : 's are'} unreachable from ${name(start)} and stay at ∞.`}`,
    highlights: { sorted: scene.nodeIds.filter((id) => !unreached.includes(id)) },
    strips: [none],
    phase: 'done',
  });
}
