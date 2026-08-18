/** Depth-first search: dive first, backtrack later, with the recursion stack on screen. */

import { defineAlgorithm, type FieldSpec, type ParamMap, type ParseResult } from '../../core/define';
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
import type { Frame, Graph } from '../../core/types';

interface DfsInput {
  readonly graph: Graph;
  readonly start: string;
  readonly forest: boolean;
}

const CODE = `function dfs(u: Node): void {
  visited.add(u);
  disc[u] = ++time;                              // discovered
  for (const v of neighbours(u)) {
    if (visited.has(v)) continue;                // already discovered: no new tree edge
    prev[v] = u;
    dfs(v);                                      // dive before looking at u's other neighbours
  }
  fin[u] = ++time;                               // finished: everything reachable below u is done
}

dfs(start);
for (const s of nodes) {
  if (!visited.has(s)) dfs(s);                   // restart, so every component gets a tree
}`;

const LINE = { enter: 1, discover: 3, scan: 4, skip: 5, recurse: 7, finish: 9, first: 12, restart: 14 } as const;

const forestField: FieldSpec = {
  key: 'forest',
  label: 'After the start node',
  kind: 'select',
  defaultValue: '0',
  options: [
    { value: '0', label: 'Stop' },
    { value: '1', label: 'Restart from every unvisited node' },
  ],
};

function parse(params: ParamMap): ParseResult<DfsInput> {
  const directed = parseDirected(params.directed);
  const list = parseEdgeList(params.g ?? '', { directed });
  if (!list.ok) return list;
  const start = parseStart(params.start, list.value.nodeCount);
  if (!start.ok) return start;
  return {
    ok: true,
    value: { graph: buildGraph(list.value, directed, parseLayout(params.layout)), start: String(start.value), forest: params.forest === '1' },
  };
}

type Gen = Generator<Frame, void, undefined>;

export const dfs = defineAlgorithm<DfsInput>({
  meta: {
    id: 'dfs',
    name: 'Depth-first search',
    category: 'graphs',
    structureKind: 'graph',
    blurb: 'Dive first, backtrack later, with the explicit stack shown.',
    complexity: {
      time: { best: 'O(V + E)', average: 'O(V + E)', worst: 'O(V + E)' },
      space: 'O(V)',
      notes: [
        'Each node is discovered once and each edge examined once per endpoint. The recursion stack is the path from the start to the current node, so its depth can reach V on a path-shaped graph.',
        'Discovery and finish times bracket: if v is discovered after u and before u finishes, v is a descendant of u in the DFS tree. That nesting is what topological sort and Tarjan build on.',
        'The tree edges (heavier lines) are the prev pointers; every other edge points at a node that was already discovered.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'recursiveCalls'],
  },
  fields: [edgesField('0-1,0-2,1-3,1-4,2-4,2-5,3-6,4-6,4-7,5-7,6-8,7-8,7-9,10-11', false), directedField, startField, forestField, layoutField, seedField],
  presets: graphPresets({ weighted: false }),
  sizeRange: { min: 4, max: MAX_GRAPH_NODES, step: 1 },
  sizeOf: graphSizeOf,
  parse,
  *run(input) {
    const scene = new GraphScene(input.graph);
    const path: string[] = [];
    const order: string[] = [];
    let time = 0;
    let roots = 0;

    const strips = (): readonly ReturnType<GraphScene['strip']>[] => [scene.strip('stack', 'stack', path), scene.strip('output', 'discovered', order)];

    function* explore(u: string, parent: string | null): Gen {
      scene.countCall();
      if (parent === null) roots += 1;
      scene.pushCall({ label: `dfs(${scene.label(u)})`, codeLine: LINE.enter });
      path.push(u);
      scene.visit(u);
      order.push(u);
      time += 1;
      const disc = time;
      scene.setLabel(u, `${disc}/`);
      yield scene.frame({
        codeLine: LINE.discover,
        explanation:
          parent === null
            ? `dfs(${scene.label(u)}): discovered at time ${disc}. It stays on the stack until everything reachable from it is finished.`
            : `dfs(${scene.label(u)}): discovered at time ${disc}, via ${scene.label(parent)}. Go deeper before returning.`,
        highlights: { active: [u], sorted: [`stack:${u}`] },
        pointers: { u },
        strips: strips(),
        phase: 'search',
      });

      for (const neighbour of scene.neighbours(u)) {
        const v = scene.examine(neighbour);
        const edge = edgeRef(neighbour.edge);
        scene.countComparison();
        if (scene.isVisited(v)) {
          const onStack = path.includes(v);
          yield scene.frame({
            codeLine: LINE.skip,
            explanation: onStack
              ? `${scene.label(u)}-${scene.label(v)}: ${scene.label(v)} is still on the stack, an ancestor of ${scene.label(u)}. A back edge, not a tree edge.`
              : `${scene.label(u)}-${scene.label(v)}: ${scene.label(v)} was discovered earlier and is already finished. Skip.`,
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
          explanation: `${scene.label(u)}-${scene.label(v)}: ${scene.label(v)} is undiscovered, so it hangs off ${scene.label(u)} in the tree. Recurse now; ${scene.label(u)}'s other neighbours wait.`,
          highlights: { active: [u], candidate: [v, edge] },
          pointers: { u, v },
          strips: strips(),
          phase: 'search',
        });
        yield* explore(v, u);
      }

      time += 1;
      scene.setLabel(u, `${disc}/${time}`);
      path.pop();
      scene.popCall();
      yield scene.frame({
        codeLine: LINE.finish,
        explanation:
          parent === null
            ? `Every neighbour of ${scene.label(u)} is done: finished at time ${time}. The stack is empty.`
            : `Every neighbour of ${scene.label(u)} is done: finished at time ${time}. Pop it and return to ${scene.label(parent)}.`,
        highlights: { sorted: [u], ...(parent === null ? {} : { active: [parent] }) },
        pointers: parent === null ? { u } : { u, parent },
        strips: strips(),
        phase: 'search',
      });
    }

    yield scene.frame({
      codeLine: LINE.first,
      explanation: `dfs(${scene.label(input.start)}): time starts at 0; each node records when it was discovered and when it finished.`,
      highlights: { active: [input.start] },
      pointers: { start: input.start },
      strips: strips(),
      phase: 'search',
    });
    yield* explore(input.start, null);

    if (input.forest) {
      for (const s of scene.nodeIds) {
        if (scene.isVisited(s)) continue;
        yield scene.frame({
          codeLine: LINE.restart,
          explanation: `${scene.label(s)} is still undiscovered: no path reaches it from anything visited so far. Start a new tree there.`,
          highlights: { candidate: [s] },
          pointers: { s },
          strips: strips(),
          phase: 'restart',
        });
        yield* explore(s, null);
      }
    }

    const unreached = scene.nodeIds.length - scene.visitedCount;
    yield scene.frame({
      codeLine: 0,
      explanation:
        unreached === 0
          ? `Done: all ${scene.visitedCount} nodes discovered and finished, ${roots} tree${roots === 1 ? '' : 's'}, ${scene.visitedCount - roots} tree edges.`
          : `Done: ${scene.visitedCount} nodes discovered; ${unreached} never reached from ${scene.label(input.start)}.`,
      highlights: { sorted: [...order] },
      strips: strips(),
      phase: 'done',
    });
  },
});
