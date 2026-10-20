/**
 * The graph editor's model: immutable snapshots of a graph being edited, the
 * edits that make one from another, and undo/redo over them. Pure, so every
 * edit is testable without a browser. See CONTRIBUTING "Graphs".
 *
 * Node ids are positions in `nodes`, 0..n-1, as the edge-list language needs
 * (every id below the largest exists). Deleting a node renumbers the ones
 * after it. Positions are layout units: x across 0..1, y down 0..1 / LAYOUT_ASPECT.
 */

import type { ParamMap } from './define';
import {
  buildGraph,
  formatEdgeList,
  formatPositions,
  MAX_GRAPH_EDGES,
  MAX_GRAPH_NODES,
  parseDirected,
  parseEdgeList,
  parseLayout,
  parsePositions,
  POSITIONS_PARAM,
  type EdgeListEdge,
} from './graphInput';
import { LAYOUT_ASPECT, type Point } from './graphLayout';
import type { Graph } from './types';

export interface EditorGraph {
  readonly directed: boolean;
  /** New edges get a weight (1) and weights can be edited. */
  readonly weighted: boolean;
  readonly nodes: readonly Point[];
  readonly edges: readonly EdgeListEdge[];
}

export const BOX_HEIGHT = 1 / LAYOUT_ASPECT;

export type EditResult = { readonly ok: true; readonly graph: EditorGraph; readonly said: string } | { readonly ok: false; readonly said: string };

function clampPoint(point: Point): Point {
  return { x: Math.min(1, Math.max(0, point.x)), y: Math.min(BOX_HEIGHT, Math.max(0, point.y)) };
}

function sameEdge(directed: boolean, edge: EdgeListEdge, from: number, to: number): boolean {
  return directed ? edge.from === from && edge.to === to : (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from);
}

/** The graph the params describe, laid out as the level lays it out; an unreadable edge list starts an empty graph. */
export function editorGraphFrom(params: ParamMap, weightedLevel: boolean): EditorGraph {
  const directed = parseDirected(params.directed);
  const list = parseEdgeList(params.g ?? '', { directed });
  if (!list.ok) return { directed, weighted: weightedLevel, nodes: [], edges: [] };
  const graph = buildGraph(list.value, directed, parseLayout(params.layout), parsePositions(params[POSITIONS_PARAM], list.value.nodeCount));
  return {
    directed,
    weighted: weightedLevel || list.value.weighted,
    nodes: graph.nodes.map((node) => ({ x: node.x, y: node.y })),
    edges: list.value.edges,
  };
}

/** The params an edited graph writes: the edge list (with every node no edge touches), direction, and the positions. */
export function editorParams(graph: EditorGraph): ParamMap {
  const touched = new Set<number>();
  for (const edge of graph.edges) {
    touched.add(edge.from);
    touched.add(edge.to);
  }
  const isolated = graph.nodes.map((_, id) => id).filter((id) => !touched.has(id));
  return {
    g: formatEdgeList(graph.edges, isolated),
    directed: graph.directed ? '1' : '0',
    [POSITIONS_PARAM]: formatPositions(graph.nodes),
  };
}

/** The graph as the renderer draws it, for the editor's own canvas. */
export function editorDrawing(graph: EditorGraph): Graph {
  return {
    directed: graph.directed,
    weighted: graph.weighted && graph.edges.length > 0 && graph.edges.every((edge) => edge.weight !== undefined),
    nodes: graph.nodes.map((point, id) => ({ id: String(id), label: String(id), x: point.x, y: point.y })),
    edges: graph.edges.map((edge, at) => ({ id: `e${at}`, from: String(edge.from), to: String(edge.to), ...(edge.weight === undefined ? {} : { weight: edge.weight }) })),
  };
}

export function addNode(graph: EditorGraph, at: Point): EditResult {
  if (graph.nodes.length >= MAX_GRAPH_NODES) return { ok: false, said: `The cap is ${MAX_GRAPH_NODES} nodes.` };
  return { ok: true, graph: { ...graph, nodes: [...graph.nodes, clampPoint(at)] }, said: `Added node ${graph.nodes.length}.` };
}

export function moveNode(graph: EditorGraph, id: number, to: Point): EditorGraph {
  if (id < 0 || id >= graph.nodes.length) return graph;
  return { ...graph, nodes: graph.nodes.map((point, at) => (at === id ? clampPoint(to) : point)) };
}

export function addEdge(graph: EditorGraph, from: number, to: number): EditResult {
  const n = graph.nodes.length;
  if (from < 0 || to < 0 || from >= n || to >= n) return { ok: false, said: 'Pick two nodes.' };
  if (from === to) return { ok: false, said: 'An edge must join two different nodes.' };
  if (graph.edges.some((edge) => sameEdge(graph.directed, edge, from, to))) return { ok: false, said: `${from} and ${to} are already joined.` };
  if (graph.edges.length >= MAX_GRAPH_EDGES) return { ok: false, said: `The cap is ${MAX_GRAPH_EDGES} edges.` };
  const edge: EdgeListEdge = graph.weighted ? { from, to, weight: 1 } : { from, to };
  return { ok: true, graph: { ...graph, edges: [...graph.edges, edge] }, said: `Joined ${from} ${graph.directed ? 'to' : 'and'} ${to}${graph.weighted ? ', weight 1' : ''}.` };
}

export function removeEdge(graph: EditorGraph, index: number): EditResult {
  const edge = graph.edges[index];
  if (edge === undefined) return { ok: false, said: 'No such edge.' };
  return { ok: true, graph: { ...graph, edges: graph.edges.filter((_, at) => at !== index) }, said: `Removed the edge ${edge.from}-${edge.to}.` };
}

/** Removes a node and its edges; every node after it moves down one id, so the ids stay 0..n-1. */
export function removeNode(graph: EditorGraph, id: number): EditResult {
  if (id < 0 || id >= graph.nodes.length) return { ok: false, said: 'No such node.' };
  const shift = (other: number): number => (other > id ? other - 1 : other);
  const edges = graph.edges.filter((edge) => edge.from !== id && edge.to !== id).map((edge) => ({ ...edge, from: shift(edge.from), to: shift(edge.to) }));
  const renumbered = id < graph.nodes.length - 1;
  return {
    ok: true,
    graph: { ...graph, nodes: graph.nodes.filter((_, at) => at !== id), edges },
    said: `Removed node ${id} and its edges.${renumbered ? ` Nodes after it are renumbered from ${id}.` : ''}`,
  };
}

export function setWeight(graph: EditorGraph, index: number, weight: number): EditResult {
  const edge = graph.edges[index];
  if (edge === undefined) return { ok: false, said: 'No such edge.' };
  if (!Number.isFinite(weight)) return { ok: false, said: 'A weight is a number, like 4 or -2.' };
  return { ok: true, graph: { ...graph, edges: graph.edges.map((other, at) => (at === index ? { ...other, weight } : other)) }, said: `Edge ${edge.from}-${edge.to} now weighs ${weight}.` };
}

/** Undirected keeps the first of a two-way pair, so the edge list stays one edge per pair. */
export function setDirected(graph: EditorGraph, directed: boolean): EditResult {
  if (graph.directed === directed) return { ok: true, graph, said: '' };
  if (directed) return { ok: true, graph: { ...graph, directed }, said: 'Edges are directed now: each goes from the node it was drawn from.' };
  const kept: EdgeListEdge[] = [];
  for (const edge of graph.edges) if (!kept.some((other) => sameEdge(false, other, edge.from, edge.to))) kept.push(edge);
  const merged = graph.edges.length - kept.length;
  return { ok: true, graph: { ...graph, directed, edges: kept }, said: `Edges are undirected now.${merged > 0 ? ` ${merged} two-way pair${merged === 1 ? '' : 's'} became one edge.` : ''}` };
}

/** The point in the box farthest from every node: where N puts a new one. */
export function freeSpot(graph: EditorGraph): Point {
  const margin = 0.04;
  let best: Point = { x: 0.5, y: BOX_HEIGHT / 2 };
  let bestGap = -1;
  for (let i = 0; i <= 24; i++) {
    for (let j = 0; j <= 10; j++) {
      const point = { x: margin + ((1 - 2 * margin) * i) / 24, y: margin + ((BOX_HEIGHT - 2 * margin) * j) / 10 };
      const gap = graph.nodes.reduce((min, node) => Math.min(min, Math.hypot(node.x - point.x, node.y - point.y)), Number.POSITIVE_INFINITY);
      if (gap > bestGap + 1e-12) {
        best = point;
        bestGap = gap;
      }
    }
  }
  return best;
}

/* ---------------- history ---------------- */

export interface History {
  readonly past: readonly EditorGraph[];
  readonly present: EditorGraph;
  readonly future: readonly EditorGraph[];
}

/** Undo steps kept; older ones fall off. Snapshots share what did not change, so this is cheap. */
export const HISTORY_LIMIT = 200;

export function startHistory(graph: EditorGraph): History {
  return { past: [], present: graph, future: [] };
}

export function commit(history: History, graph: EditorGraph): History {
  if (graph === history.present) return history;
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: graph, future: [] };
}

export function undo(history: History): History {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo(history: History): History {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
}
