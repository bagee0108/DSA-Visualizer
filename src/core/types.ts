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

export interface TreeStrip {
  readonly label: string;
  readonly kind: 'queue' | 'stack' | 'output';
  readonly items: readonly { readonly id: string; readonly label: string }[];
}

export interface TreeSnapshot {
  readonly kind: 'tree';
  readonly arity: 'binary' | 'nary';
  readonly rootId: string | null;
  readonly nodes: readonly TreeNodeSnapshot[];
  readonly strips: readonly TreeStrip[];
}

export type StructureSnapshot = ArraySnapshot | TreeSnapshot;

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
