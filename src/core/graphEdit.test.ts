import { describe, expect, it } from 'vitest';

import { bfs } from '../algorithms/graphs/bfs';
import { kruskal } from '../algorithms/graphs/kruskal';
import { graphOf, runFrames } from '../algorithms/frameHygiene';
import { paramsToSearch } from '../pages/VisualizePage';
import {
  addEdge,
  addNode,
  BOX_HEIGHT,
  commit,
  editorDrawing,
  editorGraphFrom,
  editorParams,
  freeSpot,
  HISTORY_LIMIT,
  moveNode,
  redo,
  removeEdge,
  removeNode,
  setDirected,
  setWeight,
  startHistory,
  undo,
  type EditorGraph,
  type EditResult,
} from './graphEdit';
import { formatPositions, MAX_GRAPH_EDGES, MAX_GRAPH_NODES, parseEdgeList, parsePositions } from './graphInput';

function ok(result: EditResult): EditorGraph {
  if (!result.ok) throw new Error(result.said);
  return result.graph;
}

const EMPTY: EditorGraph = { directed: false, weighted: false, nodes: [], edges: [] };

function triangle(weighted = false, directed = false): EditorGraph {
  let graph: EditorGraph = { ...EMPTY, weighted, directed };
  for (const at of [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.3 }, { x: 0.9, y: 0.1 }]) graph = ok(addNode(graph, at));
  graph = ok(addEdge(graph, 0, 1));
  graph = ok(addEdge(graph, 1, 2));
  return graph;
}

describe('graph editor: edits', () => {
  it('adds nodes with the next id and keeps them inside the layout box', () => {
    const graph = ok(addNode(EMPTY, { x: 2, y: -1 }));
    expect(graph.nodes).toEqual([{ x: 1, y: 0 }]);
    expect(ok(addNode(graph, { x: 0.5, y: 0.2 })).nodes).toHaveLength(2);
  });

  it('joins two nodes once, refuses a loop, a repeat and an unknown node, and says why', () => {
    const graph = triangle();
    expect(addEdge(graph, 0, 0)).toEqual({ ok: false, said: 'An edge must join two different nodes.' });
    expect(addEdge(graph, 1, 0).ok).toBe(false);
    expect(addEdge(graph, 0, 7).ok).toBe(false);
    // Directed, 1 to 0 is a different edge from 0 to 1.
    expect(addEdge(triangle(false, true), 1, 0).ok).toBe(true);
  });

  it('gives new edges a weight of 1 on a weighted level, and edits it', () => {
    const graph = triangle(true);
    expect(graph.edges[0]).toEqual({ from: 0, to: 1, weight: 1 });
    expect(ok(setWeight(graph, 0, -3)).edges[0]?.weight).toBe(-3);
    expect(setWeight(graph, 0, Number.NaN).ok).toBe(false);
  });

  it('removes a node with its edges and renumbers the ones after it, so ids stay 0..n-1', () => {
    const graph = ok(addEdge(triangle(), 0, 2));
    const result = removeNode(graph, 1);
    const after = ok(result);
    expect(after.nodes).toEqual([{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }]);
    expect(after.edges).toEqual([{ from: 0, to: 1 }]);
    expect(result.said).toContain('renumbered');
    expect(ok(removeEdge(graph, 0)).edges).toHaveLength(2);
  });

  it('merges a two-way pair when edges become undirected, and keeps orientation when they become directed', () => {
    let graph = ok(addEdge(triangle(false, true), 1, 0));
    expect(graph.edges).toHaveLength(3);
    const undirected = setDirected(graph, false);
    expect(ok(undirected).edges).toHaveLength(2);
    expect(undirected.said).toContain('1 two-way pair became one edge');
    graph = ok(setDirected(ok(undirected), true));
    expect(graph.edges).toEqual([{ from: 0, to: 1 }, { from: 1, to: 2 }]);
  });

  it('holds the caps: 150 nodes and 600 edges', () => {
    const full: EditorGraph = { ...EMPTY, nodes: Array.from({ length: MAX_GRAPH_NODES }, () => ({ x: 0.5, y: 0.2 })) };
    expect(addNode(full, { x: 0, y: 0 })).toEqual({ ok: false, said: 'The cap is 150 nodes.' });
    const edges = Array.from({ length: MAX_GRAPH_EDGES }, (_, at) => ({ from: at % 149, to: 149 }));
    expect(addEdge({ ...full, edges }, 0, 1)).toEqual({ ok: false, said: 'The cap is 600 edges.' });
  });

  it('moves a node, clamped to the box', () => {
    expect(moveNode(triangle(), 0, { x: 0.3, y: 5 }).nodes[0]).toEqual({ x: 0.3, y: BOX_HEIGHT });
  });

  it('puts a new node at the free spot farthest from the rest', () => {
    const spot = freeSpot(triangle());
    for (const node of triangle().nodes) expect(Math.hypot(node.x - spot.x, node.y - spot.y)).toBeGreaterThan(0.2);
  });
});

describe('graph editor: undo and redo over immutable snapshots', () => {
  it('walks back and forth, and a new edit drops the redo branch', () => {
    const a = triangle();
    const b = ok(addEdge(a, 0, 2));
    const c = ok(removeNode(b, 0));
    let history = commit(commit(startHistory(a), b), c);
    history = undo(undo(history));
    expect(history.present).toBe(a);
    history = redo(history);
    expect(history.present).toBe(b);
    const d = ok(addNode(b, { x: 0.2, y: 0.3 }));
    history = commit(history, d);
    expect(history.future).toEqual([]);
    expect(redo(history)).toBe(history);
    expect(undo(startHistory(a)).present).toBe(a);
  });

  it('never mutates a snapshot', () => {
    const a = Object.freeze(triangle());
    expect(() => removeNode(a, 0)).not.toThrow();
    expect(a.nodes).toHaveLength(3);
  });

  it('keeps a bounded history', () => {
    let history = startHistory(triangle());
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) history = commit(history, moveNode(history.present, 0, { x: i / 1000, y: 0.2 }));
    expect(history.past).toHaveLength(HISTORY_LIMIT);
  });
});

describe('graph editor: params, positions and the URL', () => {
  it('writes the edge list with isolated nodes, direction and positions, and reads them back the same', () => {
    const graph = ok(addNode(triangle(true), { x: 0.4, y: 0.4 }));
    const params = editorParams(graph);
    expect(params.g).toBe('0-1:1,1-2:1,3');
    expect(params.directed).toBe('0');
    expect(editorGraphFrom(params, true)).toEqual(graph);
  });

  it('runs a level on the hand-placed positions', () => {
    const graph = triangle();
    const [first] = runFrames(bfs, editorParams(graph));
    if (first === undefined) throw new Error('no frames');
    const drawn = graphOf(first).graph.nodes.map((node) => ({ x: node.x, y: node.y }));
    expect(drawn).toEqual(graph.nodes);
  });

  it('never writes positions into the URL: a link shares topology only', () => {
    const search = paramsToSearch({ ...editorParams(triangle()) }, {});
    expect(search).toContain('g=0-1,1-2');
    expect(search).not.toContain('pos');
  });

  it('ignores positions for another graph instead of half-using them', () => {
    expect(parsePositions(formatPositions([{ x: 0.1, y: 0.1 }]), 2)).toBeNull();
    expect(parsePositions('0.1,0.1;nope', 2)).toBeNull();
    expect(parsePositions('0.1,0.1;2,0.1', 2)).toBeNull();
    expect(parsePositions(undefined, 2)).toBeNull();
  });

  it('starts an empty graph from an edge list that does not parse', () => {
    expect(editorGraphFrom({ g: '0-' }, false).nodes).toEqual([]);
  });

  it('leaves the level its own refusal on the edited graph, with its established message', () => {
    const directed = editorParams(triangle(true, true));
    const result = kruskal.build(directed);
    expect(result.ok).toBe(false);
    expect(kruskal.build({ ...directed, directed: '0' }).ok).toBe(true);
  });

  it('draws what it edits: the editor drawing matches the parsed edge list', () => {
    const graph = triangle(true);
    const drawing = editorDrawing(graph);
    const parsed = parseEdgeList(editorParams(graph).g ?? '');
    expect(parsed.ok && parsed.value.edges.length).toBe(drawing.edges.length);
    expect(drawing.weighted).toBe(true);
  });
});
