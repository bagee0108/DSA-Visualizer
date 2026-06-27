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

export interface ArraySnapshot {
  readonly kind: 'array';
  readonly elements: readonly ArrayElement[];
  readonly regions: readonly ArrayRegion[];
  readonly treeView?: boolean;
}

export type StructureSnapshot = ArraySnapshot;

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

export type Pointers = Readonly<Record<string, number>>;

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
