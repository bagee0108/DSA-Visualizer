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
  readonly boxes?: { readonly rows: number; readonly cols: number };
  /** Draw pencil marks on empty squares. */
  readonly marks?: boolean;
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
  private readonly boxes: { readonly rows: number; readonly cols: number } | null;

  private values: (string | null)[];
  private cellsCache: readonly (string | null)[] | null = null;
  private marks: (string | null)[] | null;
  private marksCache: readonly (string | null)[] | null = null;
  private readonly fixed: boolean[];
  private fixedCache: readonly boolean[] | null = null;

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
    const boxes = options.boxes;
    if (boxes !== undefined && (rows % boxes.rows !== 0 || cols % boxes.cols !== 0)) throw new RangeError('Boxes must tile the board');
    this.boxes = boxes === undefined ? null : { rows: boxes.rows, cols: boxes.cols };
    this.tree = options.searchTree === true ? new TreeScene('nary') : null;
    this.values = new Array<string | null>(rows * cols).fill(null);
    this.marks = options.marks === true ? new Array<string | null>(rows * cols).fill(null) : null;
    this.fixed = new Array<boolean>(rows * cols).fill(false);
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

  /** A square the puzzle gives: set once, before the run starts working, and drawn heavier. */
  give(row: number, col: number, value: string): void {
    this.set(row, col, value);
    this.fixed[this.index(row, col)] = true;
    this.fixedCache = null;
  }

  /** Pencil marks on a square, or null to clear them. Uncounted: the algorithm's own bookkeeping is counted where it happens. */
  mark(row: number, col: number, marks: string | null): void {
    if (this.marks === null) throw new Error('This board was made without pencil marks');
    this.marks[this.index(row, col)] = marks;
    this.marksCache = null;
  }

  peekMark(row: number, col: number): string | null {
    return this.marks?.[this.index(row, col)] ?? null;
  }

  /** Everything on the board, to go back to after a guess fails. */
  save(): { readonly values: readonly (string | null)[]; readonly marks: readonly (string | null)[] | null } {
    return { values: [...this.values], marks: this.marks === null ? null : [...this.marks] };
  }

  /** Put the board back as `save` found it. Uncounted: it is the picture of an undo. */
  restore(saved: ReturnType<GridScene['save']>): void {
    this.values = [...saved.values];
    this.marks = saved.marks === null ? null : [...saved.marks];
    this.cellsCache = null;
    this.marksCache = null;
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

  private marksSnapshot(): readonly (string | null)[] | null {
    if (this.marks === null) return null;
    if (this.marksCache === null) this.marksCache = Object.freeze([...this.marks]);
    return this.marksCache;
  }

  private fixedSnapshot(): readonly boolean[] | null {
    if (!this.fixed.includes(true)) return null;
    if (this.fixedCache === null) this.fixedCache = Object.freeze([...this.fixed]);
    return this.fixedCache;
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
      boxes: this.boxes,
      fixed: this.fixedSnapshot(),
      marks: this.marksSnapshot(),
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
