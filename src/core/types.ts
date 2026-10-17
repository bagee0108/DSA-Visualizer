/**
 * The frame contract. Every algorithm in this app is a pure generator that
 * yields immutable `Frame` objects.
 */

export type EntityId = number | string;

export type StructureKind = 'array' | 'tree' | 'graph' | 'grid' | 'list' | 'matrix' | 'split';

/**
 * What an array slot holds: a number, drawn as a bar of that height, or a
 * short string such as one letter of a text, drawn as a tile. One array holds
 * one kind; frameHygiene checks it.
 */
export type ArrayValue = number | string;

export interface ArrayElement {
  readonly id: number;
  readonly value: ArrayValue;
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

export type StripItem = Strip['items'][number];

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

/** A table position, 0-based, rows first. */
export interface MatrixCell {
  readonly row: number;
  readonly col: number;
}

/** A dependency drawn from one cell to another: where a value came from. */
export interface MatrixArrow {
  readonly from: MatrixCell;
  readonly to: MatrixCell;
  /** The move the arrow stands for, such as "match" or "delete". */
  readonly label?: string;
}

/**
 * A table of numbers filled in over a run: a DP table. Its shape and headers
 * are fixed for the run. Highlights and pointers name places in it with
 * cellRef, rowRef and colRef (src/core/matrixScene.ts).
 */
export interface MatrixSnapshot {
  readonly kind: 'matrix';
  readonly rows: number;
  readonly cols: number;
  /** Row-major; null is a cell not computed yet. */
  readonly cells: readonly (number | null)[];
  /** One label per row and per column, such as the letters of two strings. */
  readonly rowHeaders: readonly string[];
  readonly colHeaders: readonly string[];
  /** What each axis counts, such as "i: prefix of a". */
  readonly rowTitle: string;
  readonly colTitle: string;
  /** The current cell's dependencies. Only for the frame that shows them. */
  readonly arrows: readonly MatrixArrow[];
  /** The traceback so far, in the order it was walked. */
  readonly path: readonly MatrixCell[];
  /**
   * Long jumps along the bottom row are drawn under it, in a band the layout
   * keeps free, rather than across the numbers they pass. Fixed for the run.
   */
  readonly arrowsUnder: boolean;
  readonly strips: readonly Strip[];
}

/** One view in a split frame. Its id and title are fixed for the run. */
export interface SplitPane {
  readonly id: string;
  readonly title: string;
  /** Tables only for now; another kind joins once its renderer can draw inside a band. */
  readonly view: MatrixSnapshot;
}

/**
 * Two or more views of one run in one frame, stacked top to bottom: a DP
 * table over its rolling row. Highlights and pointers name a place in a pane
 * as paneRef(pane, ref) (src/core/splitScene.ts). Strips belong to the frame,
 * not to a pane, and sit under the last one.
 */
export interface SplitSnapshot {
  readonly kind: 'split';
  readonly panes: readonly SplitPane[];
  readonly strips: readonly Strip[];
}

export type StructureSnapshot = ArraySnapshot | TreeSnapshot | GraphSnapshot | MatrixSnapshot | SplitSnapshot;

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
