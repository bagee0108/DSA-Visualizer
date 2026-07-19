/**
 * ArrayScene - the authoring surface for array algorithms. Frames are
 * immutable, so consecutive frames that do not mutate the array share one
 * frozen elements array; a run with 5000 frames over 200 elements allocates a
 * few hundred arrays, not 5000.
 */

import type {
  ArrayElement,
  ArrayRegion,
  ArraySnapshot,
  CallStackEntry,
  Counters,
  Frame,
  Highlights,
  Pointers,
} from './types';

const NO_REGIONS: readonly ArrayRegion[] = Object.freeze([]);
const NO_STACK: readonly CallStackEntry[] = Object.freeze([]);
const NO_POINTERS: Pointers = Object.freeze({});

export interface FrameInput {
  readonly explanation: string;
  readonly codeLine: number;
  readonly highlights?: Highlights;
  readonly pointers?: Pointers;
  readonly regions?: readonly ArrayRegion[];
  readonly phase?: string;
  readonly includeSorted?: boolean;
  readonly auxPointers?: Pointers;
}

export class ArrayScene {
  private readonly values: number[];
  private readonly ids: number[];
  private readonly sorted = new Set<number>();
  private readonly stack: CallStackEntry[] = [];

  private comparisons = 0;
  private swaps = 0;
  private reads = 0;
  private writes = 0;
  private recursiveCalls = 0;
  private readonly extra: Record<string, number> = {};

  private elementsCache: readonly ArrayElement[] | null = null;
  private stackCache: readonly CallStackEntry[] | null = null;
  private sortedCache: readonly number[] | null = null;

  private auxValues: number[] | null = null;
  private auxIds: number[] = [];
  private auxLabel = 'aux';
  private auxFrom = 0;
  private auxTo = -1;
  private auxCache: readonly ArrayElement[] | null = null;

  private heapSize: number | null = null;

  private nextId: number;

  constructor(values: readonly number[]) {
    this.values = [...values];
    this.ids = values.map((_, index) => index);
    this.nextId = values.length;
  }

  get length(): number {
    return this.values.length;
  }

  push(value: number): number {
    this.values.push(value);
    this.ids.push(this.nextId);
    this.nextId += 1;
    this.writes += 1;
    this.elementsCache = null;
    return this.values.length - 1;
  }

  pop(): number {
    const value = this.values.pop();
    this.ids.pop();
    if (value === undefined) throw new RangeError('pop on an empty array');
    this.reads += 1;
    this.elementsCache = null;
    return value;
  }

  private at(index: number): number {
    const value = this.values[index];
    if (value === undefined) {
      throw new RangeError(`Index ${index} out of bounds for length ${this.values.length}`);
    }
    return value;
  }

  read(index: number): number {
    this.reads += 1;
    return this.at(index);
  }

  peek(index: number): number {
    return this.at(index);
  }

  write(index: number, value: number): void {
    this.at(index);
    this.writes += 1;
    this.values[index] = value;
    this.elementsCache = null;
  }

  swap(i: number, j: number): void {
    const a = this.at(i);
    const b = this.at(j);
    this.values[i] = b;
    this.values[j] = a;

    const idA = this.ids[i];
    const idB = this.ids[j];
    if (idA !== undefined && idB !== undefined) {
      this.ids[i] = idB;
      this.ids[j] = idA;
    }

    this.swaps += 1;
    this.reads += 2;
    this.writes += 2;
    this.elementsCache = null;
  }

  compare(i: number, j: number): number {
    this.comparisons += 1;
    this.reads += 2;
    const a = this.at(i);
    const b = this.at(j);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  compareValue(index: number, value: number): number {
    this.comparisons += 1;
    this.reads += 1;
    const a = this.at(index);
    return a < value ? -1 : a > value ? 1 : 0;
  }

  copyToAux(label: string, from: number, to: number): void {
    if (this.auxValues === null) {
      this.auxValues = new Array<number>(this.values.length).fill(0);
      this.auxIds = new Array<number>(this.values.length).fill(-1);
    }
    for (let i = from; i <= to; i++) {
      this.auxValues[i] = this.at(i);
      this.auxIds[i] = this.ids[i] ?? i;
      this.reads += 1;
      this.writes += 1;
    }
    this.auxLabel = label;
    this.auxFrom = from;
    this.auxTo = to;
    this.auxCache = null;
  }

  private auxAt(index: number): number {
    const value = this.auxValues?.[index];
    if (value === undefined) throw new RangeError(`aux index ${index} is not populated`);
    return value;
  }

  auxPeek(index: number): number {
    return this.auxAt(index);
  }

  compareAux(i: number, j: number): number {
    this.comparisons += 1;
    this.reads += 2;
    const a = this.auxAt(i);
    const b = this.auxAt(j);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  moveFromAux(target: number, source: number): void {
    const value = this.auxAt(source);
    this.at(target);
    this.reads += 1;
    this.writes += 1;
    this.values[target] = value;
    const movedId = this.auxIds[source];
    if (movedId !== undefined && movedId >= 0) this.ids[target] = movedId;
    this.elementsCache = null;
  }

  clearAux(): void {
    this.auxFrom = 0;
    this.auxTo = -1;
    this.auxCache = null;
  }

  setHeapSize(size: number | null): void {
    this.heapSize = size;
  }

  countCall(): void {
    this.recursiveCalls += 1;
  }

  countComparison(count = 1): void {
    this.comparisons += count;
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

  markSorted(index: number): void {
    this.sorted.add(index);
    this.sortedCache = null;
  }

  markSortedRange(from: number, to: number): void {
    for (let i = from; i <= to; i++) this.sorted.add(i);
    this.sortedCache = null;
  }

  isSorted(index: number): boolean {
    return this.sorted.has(index);
  }

  toArray(): number[] {
    return [...this.values];
  }

  counters(): Counters {
    return {
      comparisons: this.comparisons,
      swaps: this.swaps,
      reads: this.reads,
      writes: this.writes,
      recursiveCalls: this.recursiveCalls,
      extra: { ...this.extra },
    };
  }

  private elements(): readonly ArrayElement[] {
    if (this.elementsCache === null) {
      const next: ArrayElement[] = new Array<ArrayElement>(this.values.length);
      for (let i = 0; i < this.values.length; i++) {
        next[i] = { id: this.ids[i] ?? i, value: this.at(i) };
      }
      this.elementsCache = Object.freeze(next);
    }
    return this.elementsCache;
  }

  private stackSnapshot(): readonly CallStackEntry[] {
    if (this.stack.length === 0) return NO_STACK;
    if (this.stackCache === null) this.stackCache = Object.freeze([...this.stack]);
    return this.stackCache;
  }

  private sortedSnapshot(): readonly number[] | null {
    if (this.sorted.size === 0) return null;
    if (this.sortedCache === null) this.sortedCache = Object.freeze([...this.sorted]);
    return this.sortedCache;
  }

  private auxElements(): readonly ArrayElement[] {
    if (this.auxCache === null) {
      const source = this.auxValues ?? [];
      const next: ArrayElement[] = source.map((value, index) => ({
        id: this.auxIds[index] ?? index,
        value,
      }));
      this.auxCache = Object.freeze(next);
    }
    return this.auxCache;
  }

  /** Build one immutable frame from the current state. */
  frame(input: FrameInput): Frame {
    const structure: ArraySnapshot = {
      kind: 'array',
      elements: this.elements(),
      regions: input.regions ?? NO_REGIONS,
      ...(this.auxValues === null || this.auxTo < this.auxFrom
        ? {}
        : {
            auxiliary: {
              label: this.auxLabel,
              elements: this.auxElements(),
              activeFrom: this.auxFrom,
              activeTo: this.auxTo,
              pointers: input.auxPointers ?? NO_POINTERS,
            },
          }),
      ...(this.heapSize === null ? {} : { heap: { size: this.heapSize } }),
    };

    let highlights: Highlights = input.highlights ?? {};
    if (input.includeSorted !== false && highlights.sorted === undefined) {
      const sorted = this.sortedSnapshot();
      if (sorted !== null) highlights = { ...highlights, sorted };
    }

    const frame: Frame = {
      structure,
      highlights,
      pointers: input.pointers ?? NO_POINTERS,
      callStack: this.stackSnapshot(),
      explanation: input.explanation,
      codeLine: input.codeLine,
      counters: this.counters(),
      ...(input.phase === undefined ? {} : { phase: input.phase }),
    };
    return frame;
  }
}
