/**
 * The frame contract. Every algorithm in this app is a pure generator that
 * yields immutable `Frame` objects.
 */

export type EntityId = number | string;

export type StructureKind = 'array' | 'tree' | 'graph' | 'grid' | 'list' | 'matrix';

export interface ArrayElement {
  readonly id: number;
  readonly value: number;
}

export type RegionTone = 'active' | 'sorted' | 'excluded' | 'left' | 'right';

export interface ArrayRegion {
  readonly from: number;
  readonly to: number;
  readonly label: string;
  readonly tone: RegionTone;
}

export interface AuxiliaryView {
  readonly label: string;
  readonly elements: readonly ArrayElement[];
  readonly activeFrom: number;
  readonly activeTo: number;
  readonly pointers: Pointers;
}

export interface HeapView {
  readonly size: number;
}

export interface ArraySnapshot {
  readonly kind: 'array';
  readonly elements: readonly ArrayElement[];
  readonly regions: readonly ArrayRegion[];
  readonly auxiliary?: AuxiliaryView;
  readonly heap?: HeapView;
}

export type NodeColor = 'red' | 'black';

export interface TreeNodeSnapshot {
  readonly id: string;
  readonly label: string;
  readonly parentId: string | null;
  readonly children: readonly (string | null)[];
  readonly badges?: Readonly<Record<string, string | number>>;
  readonly color?: NodeColor;
  readonly terminal?: boolean;
}

/** A row of chips under the structure: a queue, a stack, a priority queue, the output order. */
export interface Strip {
  readonly label: string;
  readonly kind: 'queue' | 'stack' | 'pq' | 'output';
  readonly items: readonly { readonly id: string; readonly label: string }[];
}

export type TreeStrip = Strip;

export interface TreeSnapshot {
  readonly kind: 'tree';
  readonly arity: 'binary' | 'nary';
  readonly rootId: string | null;
  readonly nodes: readonly TreeNodeSnapshot[];
  readonly strips: readonly TreeStrip[];
}

export interface GraphNode {
  readonly id: string;
  readonly label: string;
  /** Unit coordinates, fixed for the run; the renderer scales them. */
  readonly x: number;
  readonly y: number;
}

export interface GraphEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly weight?: number;
}

/** Topology plus layout. Immutable for a whole run and shared by reference across its frames. */
export interface Graph {
  readonly directed: boolean;
  readonly weighted: boolean;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/** A pointer from one node to another that is not an edge of the graph: a union-find parent. */
export interface GraphLink {
  readonly from: string;
  readonly to: string;
}

export interface GraphSnapshot {
  readonly kind: 'graph';
  /** The same object in every frame of a run; never mutated. */
  readonly graph: Graph;
  readonly visited: readonly string[];
  /** Edge ids that currently form the search tree (the `prev` pointers). */
  readonly treeEdges: readonly string[];
  /** Algorithm-owned pointers drawn as arrows; empty for algorithms that have none. */
  readonly links: readonly GraphLink[];
  /** Text beside each node: a distance, a discovery time, a set representative. */
  readonly labels: Readonly<Record<string, string>>;
  readonly strips: readonly Strip[];
}

export type StructureSnapshot = ArraySnapshot | TreeSnapshot | GraphSnapshot;

export type HighlightRole =
  | 'comparing'
  | 'swapped'
  | 'visited'
  | 'active'
  | 'sorted'
  | 'pivot'
  | 'candidate'
  | 'excluded';

export type Highlights = Readonly<Partial<Record<HighlightRole, readonly EntityId[]>>>;

export type Pointers = Readonly<Record<string, number | string>>;

export interface CallStackEntry {
  readonly label: string;
  readonly detail?: string;
  readonly codeLine?: number;
}

export interface Counters {
  readonly comparisons: number;
  readonly swaps: number;
  readonly reads: number;
  readonly writes: number;
  readonly recursiveCalls: number;
  readonly extra: Readonly<Record<string, number>>;
}

export const ZERO_COUNTERS: Counters = {
  comparisons: 0,
  swaps: 0,
  reads: 0,
  writes: 0,
  recursiveCalls: 0,
  extra: {},
};

/** One instant of a run. Immutable; never mutate a frame after yielding it. */
export interface Frame {
  readonly structure: StructureSnapshot;
  readonly highlights: Highlights;
  readonly pointers: Pointers;
  readonly callStack: readonly CallStackEntry[];
  readonly explanation: string;
  readonly codeLine: number;
  readonly counters: Counters;
  readonly phase?: string;
}

/** A generator of frames. Must be pure: same input in, same frames out. */
export type FrameGenerator = Generator<Frame, void, undefined>;
