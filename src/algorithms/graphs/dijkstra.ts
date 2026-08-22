/** Dijkstra's shortest paths, with the priority queue on screen as it evolves. */

import { defineAlgorithm, type ParamMap, type ParseResult } from '../../core/define';
import {
  buildGraph,
  directedField,
  edgesField,
  graphPresets,
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

interface DijkstraInput {
  readonly graph: Graph;
  readonly start: string;
}

const CODE = `function dijkstra(start: Node): void {
  for (const v of nodes) dist[v] = Infinity;
  dist[start] = 0;
  pq.push([0, start]);
  while (pq.size > 0) {
    const [d, u] = pq.popMin();                  // smallest tentative distance first
    if (d > dist[u]) continue;                   // stale: u was improved after this was pushed
    settled.add(u);                              // nothing left in pq can beat d, so it is final
    for (const [v, w] of neighbours(u)) {
      if (dist[u] + w < dist[v]) {               // relax: a shorter way to v, through u
        dist[v] = dist[u] + w;
        prev[v] = u;
        pq.push([dist[v], v]);                   // lazy: the old entry for v stays and goes stale
      }
    }
  }
}`;

const LINE = { enter: 1, init: 2, push0: 4, loop: 5, pop: 6, stale: 7, settle: 8, scan: 9, test: 10, improve: 11, push: 13 } as const;

function parse(params: ParamMap): ParseResult<DijkstraInput> {
  const directed = parseDirected(params.directed);
  const list = parseEdgeList(params.g ?? '', { directed, requireWeights: true });
  if (!list.ok) return list;
  const negative = list.value.edges.find((edge) => (edge.weight ?? 0) < 0);
  if (negative !== undefined) {
    return { ok: false, error: `Edge ${negative.from}-${negative.to} has weight ${negative.weight}. Dijkstra needs non-negative weights; that is Bellman-Ford territory.` };
  }
  const start = parseStart(params.start, list.value.nodeCount);
  if (!start.ok) return start;
  return { ok: true, value: { graph: buildGraph(list.value, directed, parseLayout(params.layout)), start: String(start.value) } };
}

function fmt(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '∞';
}

export const dijkstra = defineAlgorithm<DijkstraInput>({
  meta: {
    id: 'dijkstra',
    name: "Dijkstra's algorithm",
    category: 'graphs',
    structureKind: 'graph',
    blurb: 'Greedy shortest paths with the priority queue laid out live.',
    complexity: {
      time: { best: 'O(E log V)', average: 'O(E log V)', worst: 'O(E log V)' },
      space: 'O(V + E)',
      notes: [
        'Greedy and correct because weights are non-negative: when a node leaves the queue with the smallest tentative distance, no path through anything still queued can be shorter.',
        'The queue is a binary heap drawn in array order, minimum first. Entries are never updated in place; an improved node is pushed again and the older entry is skipped as stale when it surfaces, which is why the queue can hold more entries than there are nodes.',
        'Each relaxation is one push, so the log V comes from the heap: up to E pushes and pops at log(size) each, on top of examining every edge once per endpoint. With V pushes at most it would read (V + E) log V; E dominates on any connected graph.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons'],
  },
  fields: [edgesField('0-1:4,0-2:1,2-1:2,1-3:1,2-3:5,3-4:3,2-4:8,4-5:2,3-5:6,6-7:1', true), directedField, startField, layoutField, seedField],
  presets: graphPresets({ weighted: true }),
  sizeRange: { min: 4, max: MAX_GRAPH_NODES, step: 1 },
  sizeOf: graphSizeOf,
  parse,
  *run(input) {
    const scene = new GraphScene(input.graph, { visitedCounter: 'nodes settled' });
    const { start } = input;
    const dist = new Map<string, number>();
    const prevEdge = new Map<string, GraphEdge>();
    const pq = new MinHeap();
    const settledOrder: string[] = [];
    for (const id of scene.nodeIds) {
      dist.set(id, Number.POSITIVE_INFINITY);
      scene.setLabel(id, '∞');
    }

    const strips = (): readonly Strip[] => [
      scene.chips('pq', 'priority queue', pq.entries.map((entry) => ({ id: `q${entry.seq}`, label: `${scene.label(entry.node)}:${fmt(entry.key)}` }))),
      scene.strip('output', 'settled', settledOrder),
    ];

    dist.set(start, 0);
    scene.setLabel(start, '0');
    const first = pq.push(0, start);
    yield scene.frame({
      codeLine: LINE.push0,
      explanation: `dijkstra(${scene.label(start)}): every distance starts at ∞ except the start at 0, which is the only queue entry.`,
      highlights: { active: [start], candidate: [`pq:q${first.seq}`] },
      pointers: { start },
      strips: strips(),
      phase: 'search',
    });

    while (pq.size > 0) {
      const entry = pq.pop();
      if (entry === undefined) break;
      const u = entry.node;
      const d = entry.key;
      const current = dist.get(u) ?? Number.POSITIVE_INFINITY;
      scene.countComparison();
      if (d > current) {
        scene.bump('stale pops');
        yield scene.frame({
          codeLine: LINE.stale,
          explanation: `Pop ${scene.label(u)} at ${fmt(d)}, but dist[${scene.label(u)}] is already ${fmt(current)}: this entry went stale when ${scene.label(u)} was improved. Skip it.`,
          highlights: { excluded: [u] },
          pointers: { u },
          strips: strips(),
          phase: 'search',
        });
        continue;
      }

      scene.visit(u);
      settledOrder.push(u);
      yield scene.frame({
        codeLine: LINE.settle,
        explanation: `Pop ${scene.label(u)} at ${fmt(d)}, the smallest tentative distance in the queue. Weights are non-negative, so nothing still queued can reach it more cheaply: ${fmt(d)} is final.`,
        highlights: { active: [u], sorted: [`output:${u}`] },
        pointers: { u },
        strips: strips(),
        phase: 'search',
      });

      for (const neighbour of scene.neighbours(u)) {
        const v = scene.examine(neighbour);
        const w = neighbour.edge.weight ?? 0;
        const edge = edgeRef(neighbour.edge);
        const candidate = d + w;
        const known = dist.get(v) ?? Number.POSITIVE_INFINITY;
        scene.countComparison();
        if (scene.isVisited(v)) {
          yield scene.frame({
            codeLine: LINE.test,
            explanation: `${scene.label(u)}-${scene.label(v)} (${fmt(w)}): ${scene.label(v)} is already settled at ${fmt(known)}, and ${fmt(d)} + ${fmt(w)} = ${fmt(candidate)} cannot beat that.`,
            highlights: { active: [u], excluded: [v, edge] },
            pointers: { u, v },
            strips: strips(),
            phase: 'search',
          });
          continue;
        }
        if (candidate >= known) {
          yield scene.frame({
            codeLine: LINE.test,
            explanation: `${scene.label(u)}-${scene.label(v)} (${fmt(w)}): ${fmt(d)} + ${fmt(w)} = ${fmt(candidate)}, not better than the ${fmt(known)} already known for ${scene.label(v)}. Leave it.`,
            highlights: { active: [u], excluded: [v, edge] },
            pointers: { u, v },
            strips: strips(),
            phase: 'search',
          });
          continue;
        }
        const old = prevEdge.get(v);
        if (old !== undefined) scene.setTreeEdge(old, false);
        prevEdge.set(v, neighbour.edge);
        scene.setTreeEdge(neighbour.edge);
        dist.set(v, candidate);
        scene.setLabel(v, fmt(candidate));
        scene.bump('relaxations');
        const pushed = pq.push(candidate, v);
        yield scene.frame({
          codeLine: LINE.push,
          explanation:
            known === Number.POSITIVE_INFINITY
              ? `${scene.label(u)}-${scene.label(v)} (${fmt(w)}): first path to ${scene.label(v)}, at ${fmt(d)} + ${fmt(w)} = ${fmt(candidate)}. Record it and push (${fmt(candidate)}, ${scene.label(v)}).`
              : `${scene.label(u)}-${scene.label(v)} (${fmt(w)}): ${fmt(d)} + ${fmt(w)} = ${fmt(candidate)} beats ${fmt(known)}. Relax: ${scene.label(v)} now hangs off ${scene.label(u)}, and a fresh entry is pushed; the old one will surface stale.`,
          highlights: { active: [u], candidate: [v, edge, `pq:q${pushed.seq}`] },
          pointers: { u, v },
          strips: strips(),
          phase: 'search',
        });
      }
    }

    const unreachable = scene.nodeIds.length - scene.visitedCount;
    yield scene.frame({
      codeLine: LINE.loop,
      explanation:
        unreachable === 0
          ? `Queue empty: all ${scene.visitedCount} nodes settled. The heavier edges are the shortest-path tree from ${scene.label(start)}.`
          : `Queue empty: ${scene.visitedCount} nodes settled; ${unreachable} stay at ∞ because no path from ${scene.label(start)} exists.`,
      highlights: { sorted: [...settledOrder] },
      strips: strips(),
      phase: 'done',
    });
  },
});
