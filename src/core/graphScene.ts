/**
 * GraphScene - the authoring surface for graph algorithms. The Graph is held by
 * reference and never mutated; only visited, tree edges, labels and strips are
 * snapshotted, each as a frozen value reused until it changes.
 */

import type { CallStackEntry, Counters, Frame, Graph, GraphEdge, GraphNode, GraphSnapshot, Highlights, Pointers, Strip } from './types';

const NO_STRIPS: readonly Strip[] = Object.freeze([]);
const NO_STACK: readonly CallStackEntry[] = Object.freeze([]);
const NO_POINTERS: Pointers = Object.freeze({});
const NO_LABELS: Readonly<Record<string, string>> = Object.freeze({});
const NO_IDS: readonly string[] = Object.freeze([]);

export interface Neighbour {
  readonly edge: GraphEdge;
  readonly to: string;
}

export interface GraphFrameInput {
  readonly explanation: string;
  readonly codeLine: number;
  readonly highlights?: Highlights;
  readonly pointers?: Pointers;
  readonly strips?: readonly Strip[];
  readonly phase?: string;
}

export function edgeRef(edge: GraphEdge): string {
  return `edge:${edge.id}`;
}

export interface GraphSceneOptions {
  /** Counter name for visit(); "nodes settled" reads better for Dijkstra. */
  readonly visitedCounter?: string;
}

export class GraphScene {
  readonly graph: Graph;
  private readonly visitedCounter: string;
  private readonly nodesById = new Map<string, GraphNode>();
  private readonly adjacency = new Map<string, Neighbour[]>();

  private readonly visitedSet = new Set<string>();
  private visitedCache: readonly string[] | null = NO_IDS;
  private readonly treeSet = new Set<string>();
  private treeCache: readonly string[] | null = NO_IDS;
  private readonly labelMap = new Map<string, string>();
  private labelCache: Readonly<Record<string, string>> | null = NO_LABELS;

  private readonly stack: CallStackEntry[] = [];
  private stackCache: readonly CallStackEntry[] | null = null;
  private comparisons = 0;
  private recursiveCalls = 0;
  private readonly extra: Record<string, number> = {};

  constructor(graph: Graph, options: GraphSceneOptions = {}) {
    this.graph = graph;
    this.visitedCounter = options.visitedCounter ?? 'nodes visited';
    for (const node of graph.nodes) {
      this.nodesById.set(node.id, node);
      this.adjacency.set(node.id, []);
    }
    for (const edge of graph.edges) {
      this.adjacency.get(edge.from)?.push({ edge, to: edge.to });
      if (!graph.directed) this.adjacency.get(edge.to)?.push({ edge, to: edge.from });
    }
    for (const list of this.adjacency.values()) list.sort((a, b) => Number(a.to) - Number(b.to));
  }

  /* ---------------- topology (read only) ---------------- */

  node(id: string): GraphNode {
    const node = this.nodesById.get(id);
    if (node === undefined) throw new Error(`Unknown node ${id}`);
    return node;
  }

  label(id: string): string {
    return this.node(id).label;
  }

  get nodeIds(): readonly string[] {
    return this.graph.nodes.map((node) => node.id);
  }

  /** Out-neighbours in ascending id order. Uncounted; charge each edge with examine(). */
  neighbours(id: string): readonly Neighbour[] {
    return this.adjacency.get(id) ?? [];
  }

  degree(id: string): number {
    return this.neighbours(id).length;
  }

  /* ---------------- counted state ---------------- */

  examine(neighbour: Neighbour): string {
    this.bump('edges examined');
    return neighbour.to;
  }

  visit(id: string): void {
    if (this.visitedSet.has(id)) return;
    this.visitedSet.add(id);
    this.visitedCache = null;
    this.bump(this.visitedCounter);
  }

  isVisited(id: string): boolean {
    return this.visitedSet.has(id);
  }

  get visitedCount(): number {
    return this.visitedSet.size;
  }

  setTreeEdge(edge: GraphEdge, on = true): void {
    const changed = on ? !this.treeSet.has(edge.id) : this.treeSet.delete(edge.id);
    if (on) this.treeSet.add(edge.id);
    if (changed) this.treeCache = null;
  }

  isTreeEdge(edge: GraphEdge): boolean {
    return this.treeSet.has(edge.id);
  }

  setLabel(id: string, text: string | null): void {
    if (text === null) {
      if (this.labelMap.delete(id)) this.labelCache = null;
      return;
    }
    if (this.labelMap.get(id) === text) return;
    this.labelMap.set(id, text);
    this.labelCache = null;
  }

  labelOf(id: string): string | undefined {
    return this.labelMap.get(id);
  }

  countComparison(count = 1): void {
    this.comparisons += count;
  }

  countCall(): void {
    this.recursiveCalls += 1;
  }

  bump(key: string, by = 1): void {
    this.extra[key] = (this.extra[key] ?? 0) + by;
  }

  pushCall(entry: CallStackEntry): void {
    this.stack.push(entry);
    this.stackCache = null;
  }

  popCall(): void {
    this.stack.pop();
    this.stackCache = null;
  }

  get depth(): number {
    return this.stack.length;
  }

  counters(): Counters {
    return {
      comparisons: this.comparisons,
      swaps: 0,
      reads: 0,
      writes: 0,
      recursiveCalls: this.recursiveCalls,
      extra: { ...this.extra },
    };
  }

  /* ---------------- strips ---------------- */

  strip(kind: Strip['kind'], label: string, ids: readonly string[]): Strip {
    return { label, kind, items: ids.map((id) => ({ id, label: this.label(id) })) };
  }

  /** A strip whose chips are not nodes: priority-queue entries, set representatives. */
  chips(kind: Strip['kind'], label: string, items: readonly { readonly id: string; readonly label: string }[]): Strip {
    return { label, kind, items: [...items] };
  }

  /* ---------------- frames ---------------- */

  private visitedSnapshot(): readonly string[] {
    if (this.visitedCache === null) this.visitedCache = Object.freeze([...this.visitedSet]);
    return this.visitedCache;
  }

  private treeSnapshot(): readonly string[] {
    if (this.treeCache === null) this.treeCache = Object.freeze([...this.treeSet]);
    return this.treeCache;
  }

  private labelSnapshot(): Readonly<Record<string, string>> {
    if (this.labelCache === null) this.labelCache = Object.freeze(Object.fromEntries(this.labelMap));
    return this.labelCache;
  }

  private stackSnapshot(): readonly CallStackEntry[] {
    if (this.stack.length === 0) return NO_STACK;
    if (this.stackCache === null) this.stackCache = Object.freeze([...this.stack]);
    return this.stackCache;
  }

  frame(input: GraphFrameInput): Frame {
    const structure: GraphSnapshot = {
      kind: 'graph',
      graph: this.graph,
      visited: this.visitedSnapshot(),
      treeEdges: this.treeSnapshot(),
      labels: this.labelSnapshot(),
      strips: input.strips ?? NO_STRIPS,
    };
    return {
      structure,
      highlights: input.highlights ?? {},
      pointers: input.pointers ?? NO_POINTERS,
      callStack: this.stackSnapshot(),
      explanation: input.explanation,
      codeLine: input.codeLine,
      counters: this.counters(),
      ...(input.phase === undefined ? {} : { phase: input.phase }),
    };
  }
}
