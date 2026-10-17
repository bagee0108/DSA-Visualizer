/**
 * GridScene - the authoring surface for board puzzles, mirroring ArrayScene.
 * A board of squares, each empty or holding a piece or a digit, and, when the
 * algorithm searches, a TreeScene of the search drawn beside it. Squares are
 * named with cellRef / rowRef / colRef, tree nodes by their own ids.
 */

import { TreeScene } from './treeScene';
import type { CallStackEntry, Counters, Frame, GridLine, GridSnapshot, Highlights, Pointers, Strip } from './types';

const NO_STRIPS: readonly Strip[] = Object.freeze([]);
const NO_LINES: readonly GridLine[] = Object.freeze([]);
const NO_STACK: readonly CallStackEntry[] = Object.freeze([]);
const NO_POINTERS: Pointers = Object.freeze({});

export interface GridSceneOptions {
  readonly rows: number;
  readonly cols: number;
  readonly rowHeaders: readonly string[];
  readonly colHeaders: readonly string[];
  readonly piece: GridSnapshot['piece'];
  readonly checkered?: boolean;
  /** Keep a search tree to draw beside the board. */
  readonly searchTree?: boolean;
}

export interface GridFrameInput {
  readonly explanation: string;
  readonly codeLine: number;
  readonly highlights?: Highlights;
  readonly pointers?: Pointers;
  readonly lines?: readonly GridLine[];
  readonly strips?: readonly Strip[];
  readonly phase?: string;
}

export class GridScene {
  readonly rows: number;
  readonly cols: number;
  /** The search tree, or null for a board without one. Its own counters are not the run's. */
  readonly tree: TreeScene | null;
  private readonly rowHeaders: readonly string[];
  private readonly colHeaders: readonly string[];
  private readonly piece: GridSnapshot['piece'];
  private readonly checkered: boolean;

  private readonly values: (string | null)[];
  private cellsCache: readonly (string | null)[] | null = null;

  private readonly stack: CallStackEntry[] = [];
  private stackCache: readonly CallStackEntry[] | null = null;
  private comparisons = 0;
  private reads = 0;
  private writes = 0;
  private recursiveCalls = 0;
  private readonly extra: Record<string, number> = {};

  constructor(options: GridSceneOptions) {
    const { rows, cols } = options;
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) throw new RangeError('A board needs at least one row and one column');
    if (options.rowHeaders.length !== rows || options.colHeaders.length !== cols) throw new RangeError('One header per row and per column');
    this.rows = rows;
    this.cols = cols;
    this.rowHeaders = Object.freeze([...options.rowHeaders]);
    this.colHeaders = Object.freeze([...options.colHeaders]);
    this.piece = options.piece;
    this.checkered = options.checkered ?? false;
    this.tree = options.searchTree === true ? new TreeScene('nary') : null;
    this.values = new Array<string | null>(rows * cols).fill(null);
  }

  private index(row: number, col: number): number {
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= this.rows || col >= this.cols) {
      throw new RangeError(`Square (${row}, ${col}) is off a ${this.rows} x ${this.cols} board`);
    }
    return row * this.cols + col;
  }

  /** A counted read. */
  read(row: number, col: number): string | null {
    this.reads += 1;
    return this.values[this.index(row, col)] ?? null;
  }

  /** Uncounted, for explanations and for checks the algorithm itself does not make. */
  peek(row: number, col: number): string | null {
    return this.values[this.index(row, col)] ?? null;
  }

  /** Put a piece or digit on a square, or clear it with null. */
  set(row: number, col: number, value: string | null): void {
    this.values[this.index(row, col)] = value;
    this.writes += 1;
    this.cellsCache = null;
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

  counters(): Counters {
    return {
      comparisons: this.comparisons,
      swaps: 0,
      reads: this.reads,
      writes: this.writes,
      recursiveCalls: this.recursiveCalls,
      extra: { ...this.extra },
    };
  }

  private cells(): readonly (string | null)[] {
    if (this.cellsCache === null) this.cellsCache = Object.freeze([...this.values]);
    return this.cellsCache;
  }

  private stackSnapshot(): readonly CallStackEntry[] {
    if (this.stack.length === 0) return NO_STACK;
    if (this.stackCache === null) this.stackCache = Object.freeze([...this.stack]);
    return this.stackCache;
  }

  frame(input: GridFrameInput): Frame {
    const structure: GridSnapshot = {
      kind: 'grid',
      rows: this.rows,
      cols: this.cols,
      cells: this.cells(),
      piece: this.piece,
      checkered: this.checkered,
      rowHeaders: this.rowHeaders,
      colHeaders: this.colHeaders,
      lines: input.lines === undefined ? NO_LINES : Object.freeze([...input.lines]),
      tree: this.tree === null ? null : this.tree.snapshot(),
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
