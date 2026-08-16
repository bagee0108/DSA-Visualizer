/** Breadth-first search: layer by layer, with the queue on screen. */

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
import type { Graph } from '../../core/types';

interface BfsInput {
  readonly graph: Graph;
  readonly start: string;
}

const CODE = `function bfs(start: Node): void {
  const queue = [start];
  dist[start] = 0;
  visited.add(start);
  while (queue.length > 0) {
    const u = queue.shift();                     // FIFO: all of layer d before any of d+1
    for (const v of neighbours(u)) {
      if (visited.has(v)) continue;              // reached earlier, by a path no longer
      visited.add(v);
      dist[v] = dist[u] + 1;                     // one layer further out
      prev[v] = u;
      queue.push(v);
    }
  }
}`;

const LINE = { enter: 1, init: 2, loop: 5, shift: 6, scan: 7, skip: 8, discover: 10, push: 12 } as const;

function parse(params: ParamMap): ParseResult<BfsInput> {
  const directed = parseDirected(params.directed);
  const list = parseEdgeList(params.g ?? '', { directed });
  if (!list.ok) return list;
  const start = parseStart(params.start, list.value.nodeCount);
  if (!start.ok) return start;
  return { ok: true, value: { graph: buildGraph(list.value, directed, parseLayout(params.layout)), start: String(start.value) } };
}

export const bfs = defineAlgorithm<BfsInput>({
  meta: {
    id: 'bfs',
    name: 'Breadth-first search',
    category: 'graphs',
    structureKind: 'graph',
    blurb: 'Layer-by-layer expansion with the queue contents visible.',
    complexity: {
      time: { best: 'O(V + E)', average: 'O(V + E)', worst: 'O(V + E)' },
      space: 'O(V)',
      notes: [
        'Every node enters the queue at most once and every edge is examined once per endpoint, which is where V + E comes from.',
        'Because the queue is first-in first-out, nodes leave it in order of distance, so the first time a node is reached is along a shortest path in edges.',
        'The tree edges (heavier lines) are the prev pointers: follow them back from any node to read off its shortest path.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons'],
  },
  fields: [edgesField('0-1,0-2,1-3,1-4,2-4,2-5,3-6,4-6,4-7,5-7,6-8,7-8,7-9,10-11', false), directedField, startField, layoutField, seedField],
  presets: graphPresets({ weighted: false }),
  sizeRange: { min: 4, max: MAX_GRAPH_NODES, step: 1 },
  sizeOf: graphSizeOf,
  parse,
  *run(input) {
    const scene = new GraphScene(input.graph);
    const { start } = input;
    const queue: string[] = [];
    const order: string[] = [];
    const dist = new Map<string, number>();
    for (const id of scene.nodeIds) scene.setLabel(id, '∞');

    const strips = (): readonly ReturnType<GraphScene['strip']>[] => [scene.strip('queue', 'queue', queue), scene.strip('output', 'visited', order)];

    scene.visit(start);
    dist.set(start, 0);
    scene.setLabel(start, '0');
    queue.push(start);
    yield scene.frame({
      codeLine: LINE.init,
      explanation: `bfs(${scene.label(start)}): it is at distance 0 and the only node in the queue.`,
      highlights: { active: [start] },
      pointers: { start },
      strips: strips(),
      phase: 'search',
    });

    while (queue.length > 0) {
      const u = queue.shift();
      if (u === undefined) break;
      const d = dist.get(u) ?? 0;
      order.push(u);
      yield scene.frame({
        codeLine: LINE.shift,
        explanation: `Dequeue ${scene.label(u)} (distance ${d}). Everything at distance ${d} leaves the queue before anything at ${d + 1} does.`,
        highlights: { active: [u], sorted: [`output:${u}`] },
        pointers: { u },
        strips: strips(),
        phase: 'search',
      });

      for (const neighbour of scene.neighbours(u)) {
        const v = scene.examine(neighbour);
        const edge = edgeRef(neighbour.edge);
        scene.countComparison();
        if (scene.isVisited(v)) {
          yield scene.frame({
            codeLine: LINE.skip,
            explanation: `${scene.label(u)}-${scene.label(v)}: ${scene.label(v)} was already reached at distance ${dist.get(v) ?? '?'}, so this edge cannot shorten anything. Skip.`,
            highlights: { active: [u], excluded: [v, edge] },
            pointers: { u, v },
            strips: strips(),
            phase: 'search',
          });
          continue;
        }
        scene.visit(v);
        dist.set(v, d + 1);
        scene.setLabel(v, String(d + 1));
        scene.setTreeEdge(neighbour.edge);
        queue.push(v);
        yield scene.frame({
          codeLine: LINE.push,
          explanation: `${scene.label(u)}-${scene.label(v)}: first time ${scene.label(v)} is reached. Its distance is ${d + 1}, its parent is ${scene.label(u)}, and it joins the back of the queue.`,
          highlights: { active: [u], candidate: [v, edge, `queue:${v}`] },
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
          ? `Queue empty: all ${scene.visitedCount} nodes have their distance from ${scene.label(start)}.`
          : `Queue empty: ${scene.visitedCount} nodes reached; ${unreachable} stay at ∞ because no path from ${scene.label(start)} exists.`,
      highlights: { sorted: [...order] },
      strips: strips(),
      phase: 'done',
    });
  },
});
