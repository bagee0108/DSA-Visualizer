/** Union-Find with path compression and union by rank, the forest redrawn as parent arrows. */

import { defineAlgorithm, type FieldSpec, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
import { buildGraph, edgesField, formatEdgeList, graphPresets, graphSizeOf, layoutField, MAX_GRAPH_NODES, parseEdgeList, parseLayout, seedField, type EdgeListEdge } from '../../core/graphInput';
import { GraphScene, edgeRef } from '../../core/graphScene';
import type { Frame, Graph, GraphEdge, Strip } from '../../core/types';

interface UnionFindInput {
  readonly graph: Graph;
  readonly finds: readonly string[];
  readonly byRank: boolean;
  readonly compress: boolean;
}

const CODE = `function find(x: Node): Node {
  let root = x;
  while (parent[root] !== root) root = parent[root];   // climb to the root
  while (parent[x] !== root) {                         // path compression:
    const next = parent[x];                            //   every node on the way
    parent[x] = root;                                  //   now points straight at the root
    x = next;
  }
  return root;
}

function union(a: Node, b: Node): boolean {
  const ra = find(a), rb = find(b);
  if (ra === rb) return false;                         // already one set
  if (rank[ra] < rank[rb]) parent[ra] = rb;            // union by rank: shorter tree
  else if (rank[ra] > rank[rb]) parent[rb] = ra;       //   goes under the taller root
  else { parent[rb] = ra; rank[ra] += 1; }             // equal: pick one, it grows by 1
  return true;
}`;

const LINE = { findEnter: 1, climb: 3, compressLoop: 4, compressSet: 6, findReturn: 9, unionEnter: 12, roots: 13, same: 14, shorter: 15, taller: 16, equal: 17, merged: 18 } as const;

const findsField: FieldSpec = {
  key: 'finds',
  label: 'Then find',
  kind: 'text',
  defaultValue: '',
  placeholder: '7, 3',
  help: 'Node ids to call find() on after the unions, to watch compression on the finished forest.',
};

const rankField: FieldSpec = {
  key: 'rank',
  label: 'Union',
  kind: 'select',
  defaultValue: '1',
  options: [
    { value: '1', label: 'By rank' },
    { value: '0', label: 'Naive: b under a' },
  ],
};

const compressField: FieldSpec = {
  key: 'compress',
  label: 'Path compression',
  kind: 'select',
  defaultValue: '1',
  options: [
    { value: '1', label: 'On' },
    { value: '0', label: 'Off' },
  ],
};

function parse(params: ParamMap): ParseResult<UnionFindInput> {
  const list = parseEdgeList(params.g ?? '');
  if (!list.ok) return list;
  const finds: string[] = [];
  for (const token of (params.finds ?? '').split(/[\s,;]+/).filter((t) => t.length > 0)) {
    const id = Number(token);
    if (!Number.isInteger(id) || id < 0 || id >= list.value.nodeCount) {
      return { ok: false, error: `find(${token}): not a node id (0-${list.value.nodeCount - 1}).` };
    }
    finds.push(String(id));
  }
  return {
    ok: true,
    value: {
      graph: buildGraph(list.value, false, parseLayout(params.layout)),
      finds,
      byRank: params.rank !== '0',
      compress: params.compress !== '0',
    },
  };
}

/** Unions that build a rank-k binomial tree, the deepest a by-rank forest can get. */
function binomial(size: number): EdgeListEdge[] {
  const edges: EdgeListEdge[] = [];
  for (let span = 1; span < size; span *= 2) {
    for (let base = 0; base + span < size; base += 2 * span) edges.push({ from: base, to: base + span });
  }
  return edges;
}

const deepPreset: PresetSpec = {
  id: 'binomial',
  label: 'Deepest tree',
  build: (size) => ({ g: formatEdgeList(binomial(size)), layout: 'auto', finds: String(size - 1), rank: '1', compress: '1' }),
};

type Gen = Generator<Frame, void, undefined>;

export const unionFind = defineAlgorithm<UnionFindInput>({
  meta: {
    id: 'union-find',
    name: 'Union-Find',
    category: 'graphs',
    structureKind: 'graph',
    blurb: 'Path compression and union by rank, with the forest redrawn live.',
    complexity: {
      time: { best: 'O(1)', average: 'O(α(n))', worst: 'O(log n)' },
      space: 'O(n)',
      notes: [
        'Union by rank keeps every tree at most log2(n) deep, so a find climbs at most log n parents even before compression.',
        'Path compression then rewires everything it climbed straight to the root, so repeated finds on the same tree flatten it: amortised over a sequence, each operation costs the inverse Ackermann function, effectively constant.',
        'The faint lines are the union requests in order; the heavy ones are the requests that actually merged two sets, and the arrows are the parent pointers, which is the structure itself.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons'],
  },
  fields: [edgesField('0-1,2-3,0-2,4-5,6-7,4-6,0-4,8-9,1-9,3-5', false), findsField, rankField, compressField, layoutField, seedField],
  presets: [deepPreset, ...graphPresets({ weighted: false, withStart: false })],
  sizeRange: { min: 4, max: MAX_GRAPH_NODES, step: 1 },
  sizeOf: graphSizeOf,
  parse,
  *run(input) {
    const scene = new GraphScene(input.graph, { visitedCounter: 'nodes in merged sets' });
    const parent = new Map<string, string>();
    const rank = new Map<string, number>();
    let sets = scene.nodeIds.length;
    for (const id of scene.nodeIds) {
      parent.set(id, id);
      rank.set(id, 0);
      scene.setLabel(id, 'r0');
    }
    const history: string[] = [];

    const strips = (): readonly Strip[] => [scene.chips('output', 'result', history.map((text, i) => ({ id: `h${i}`, label: text })))];
    const rootLabel = (id: string): void => {
      if (parent.get(id) === id) scene.setLabel(id, `r${rank.get(id) ?? 0}`);
      else scene.setLabel(id, null);
    };

    function* find(x: string, phase: string): Generator<Frame, string, undefined> {
      scene.countCall();
      scene.bump('finds');
      scene.pushCall({ label: `find(${scene.label(x)})`, codeLine: LINE.findEnter });
      const path: string[] = [];
      let root = x;
      while (parent.get(root) !== root) {
        const next = parent.get(root) ?? root;
        scene.countComparison();
        scene.bump('parent hops');
        path.push(root);
        yield scene.frame({
          codeLine: LINE.climb,
          explanation: `find(${scene.label(x)}): ${scene.label(root)} is not its own parent, so climb to ${scene.label(next)}.`,
          highlights: { active: [root], candidate: [next, `link:${root}`], visited: [...path] },
          pointers: { x, root },
          strips: strips(),
          phase,
        });
        root = next;
      }
      scene.countComparison();
      yield scene.frame({
        codeLine: LINE.findReturn,
        explanation:
          path.length === 0
            ? `find(${scene.label(x)}): ${scene.label(x)} is its own parent, so it is the root of its set.`
            : `${scene.label(root)} is its own parent: the root of ${scene.label(x)}'s set, ${path.length} hop${path.length === 1 ? '' : 's'} up.`,
        highlights: { pivot: [root], visited: [...path] },
        pointers: { x, root },
        strips: strips(),
        phase,
      });

      if (input.compress && path.length > 1) {
        for (const node of path.slice(0, -1)) {
          scene.setLink(node, root);
          parent.set(node, root);
          scene.bump('pointers compressed');
          yield scene.frame({
            codeLine: LINE.compressSet,
            explanation: `Path compression: ${scene.label(node)} now points straight at ${scene.label(root)}, so the next find from here is one hop.`,
            highlights: { pivot: [root], candidate: [node, `link:${node}`], visited: [...path] },
            pointers: { x, root },
            strips: strips(),
            phase,
          });
        }
      }
      scene.popCall();
      return root;
    }

    function* union(edge: GraphEdge): Gen {
      const a = edge.from;
      const b = edge.to;
      scene.bump('unions');
      scene.pushCall({ label: `union(${scene.label(a)}, ${scene.label(b)})`, codeLine: LINE.unionEnter });
      yield scene.frame({
        codeLine: LINE.roots,
        explanation: `union(${scene.label(a)}, ${scene.label(b)}): find the root of each side.`,
        highlights: { active: [a, b], comparing: [edgeRef(edge)] },
        pointers: { a, b },
        strips: strips(),
        phase: 'union',
      });
      const ra = yield* find(a, 'union');
      const rb = yield* find(b, 'union');
      scene.countComparison();
      if (ra === rb) {
        history.push(`${scene.label(a)}-${scene.label(b)} same`);
        yield scene.frame({
          codeLine: LINE.same,
          explanation: `Both roots are ${scene.label(ra)}: ${scene.label(a)} and ${scene.label(b)} are already in one set. Nothing changes; this edge would close a cycle.`,
          highlights: { excluded: [edgeRef(edge)], pivot: [ra] },
          pointers: { a, b, root: ra },
          strips: strips(),
          phase: 'union',
        });
        scene.popCall();
        return;
      }

      const rankA = rank.get(ra) ?? 0;
      const rankB = rank.get(rb) ?? 0;
      let child = rb;
      let top = ra;
      let line: number = LINE.equal;
      let why: string;
      if (!input.byRank) {
        why = `Naive union: ${scene.label(rb)} goes under ${scene.label(ra)} regardless of size, so trees can grow into chains.`;
      } else if (rankA < rankB) {
        scene.countComparison();
        child = ra;
        top = rb;
        line = LINE.shorter;
        why = `rank ${rankA} < rank ${rankB}: the shorter tree at ${scene.label(ra)} goes under ${scene.label(rb)}, so no root's height grows.`;
      } else if (rankA > rankB) {
        scene.countComparison(2);
        line = LINE.taller;
        why = `rank ${rankA} > rank ${rankB}: ${scene.label(rb)} goes under the taller root ${scene.label(ra)}, whose rank stays ${rankA}.`;
      } else {
        scene.countComparison(2);
        why = `equal ranks ${rankA}: ${scene.label(rb)} goes under ${scene.label(ra)}, and ${scene.label(ra)}'s rank rises to ${rankA + 1}, the only way a rank ever grows.`;
      }
      parent.set(child, top);
      scene.setLink(child, top);
      if (input.byRank && rankA === rankB) rank.set(top, rankA + 1);
      rootLabel(child);
      rootLabel(top);
      scene.setTreeEdge(edge);
      scene.visit(a);
      scene.visit(b);
      sets -= 1;
      scene.bump('merges');
      history.push(`${scene.label(a)}-${scene.label(b)} join`);
      yield scene.frame({
        codeLine: line,
        explanation: `${why} ${sets} set${sets === 1 ? '' : 's'} left.`,
        highlights: { pivot: [top], candidate: [child, `link:${child}`], sorted: [edgeRef(edge)] },
        pointers: { a, b, root: top },
        strips: strips(),
        phase: 'union',
      });
      scene.popCall();
    }

    yield scene.frame({
      codeLine: 0,
      explanation: `${sets} singleton sets: every node is its own parent, a root of rank 0. The faint lines are the union requests, taken in order.`,
      strips: strips(),
      phase: 'init',
    });

    for (const edge of scene.graph.edges) yield* union(edge);

    for (const x of input.finds) {
      yield scene.frame({
        codeLine: LINE.findEnter,
        explanation: `find(${scene.label(x)}) on the finished forest: climb, then flatten the path.`,
        highlights: { active: [x] },
        pointers: { x },
        strips: strips(),
        phase: 'find',
      });
      const root = yield* find(x, 'find');
      history.push(`f(${scene.label(x)})=${scene.label(root)}`);
      yield scene.frame({
        codeLine: LINE.findReturn,
        explanation: `find(${scene.label(x)}) = ${scene.label(root)}.`,
        highlights: { pivot: [root], active: [x] },
        pointers: { x, root },
        strips: strips(),
        phase: 'find',
      });
    }

    const counters = scene.counters();
    const maxRank = Math.max(0, ...[...rank.values()]);
    yield scene.frame({
      codeLine: 0,
      explanation: `Done: ${sets} set${sets === 1 ? '' : 's'}, highest rank ${maxRank}, ${counters.extra['parent hops'] ?? 0} parent hops over ${counters.extra.finds ?? 0} finds.`,
      strips: strips(),
      phase: 'done',
    });
  },
});
