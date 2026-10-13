/**
 * MatrixScene - the authoring surface for table algorithms: the DP family.
 * Shape and headers are fixed for the run and shared by every frame. Cells
 * and the traceback are snapshotted as frozen values reused until they
 * change, so a long fill does not copy the table per frame.
 *
 * Highlights and pointers name places with cellRef, rowRef and colRef, in the
 * same prefixed style the graph uses for edges.
 */

import type {
  CallStackEntry,
  Counters,
  Frame,
  Highlights,
  MatrixArrow,
  MatrixCell,
  MatrixSnapshot,
  Pointers,
  Strip,
} from './types';

const NO_STRIPS: readonly Strip[] = Object.freeze([]);
const NO_STACK: readonly CallStackEntry[] = Object.freeze([]);
const NO_POINTERS: Pointers = Object.freeze({});
const NO_ARROWS: readonly MatrixArrow[] = Object.freeze([]);
const NO_PATH: readonly MatrixCell[] = Object.freeze([]);

export function cellRef(row: number, col: number): string {
  return `cell:${row}:${col}`;
}

export function rowRef(row: number): string {
  return `row:${row}`;
}

export function colRef(col: number): string {
  return `col:${col}`;
}

export type MatrixRef =
  | { readonly kind: 'cell'; readonly row: number; readonly col: number }
  | { readonly kind: 'row'; readonly index: number }
  | { readonly kind: 'col'; readonly index: number };

/** The inverse of the ref helpers; null for anything that is not one. */
export function parseMatrixRef(ref: string): MatrixRef | null {
  const cell = /^cell:(\d+):(\d+)$/.exec(ref);
  if (cell !== null) return { kind: 'cell', row: Number(cell[1]), col: Number(cell[2]) };
  const line = /^(row|col):(\d+)$/.exec(ref);
  if (line !== null) return { kind: line[1] === 'row' ? 'row' : 'col', index: Number(line[2]) };
  return null;
}

export interface MatrixSceneOptions {
  readonly rowHeaders: readonly string[];
  readonly colHeaders: readonly string[];
  readonly rowTitle: string;
  readonly colTitle: string;
}

export interface MatrixFrameInput {
  readonly explanation: string;
  readonly codeLine: number;
  readonly highlights?: Highlights;
  readonly pointers?: Pointers;
  readonly arrows?: readonly MatrixArrow[];
  readonly strips?: readonly Strip[];
  readonly phase?: string;
}

export class MatrixScene {
  readonly rows: number;
  readonly cols: number;
  private readonly rowHeaders: readonly string[];
  private readonly colHeaders: readonly string[];
  private readonly rowTitle: string;
  private readonly colTitle: string;

  private readonly values: (number | null)[];
  private cellsCache: readonly (number | null)[] | null = null;
  private readonly walked: MatrixCell[] = [];
  private pathCache: readonly MatrixCell[] | null = NO_PATH;

  private readonly stack: CallStackEntry[] = [];
  private stackCache: readonly CallStackEntry[] | null = null;
  private comparisons = 0;
  private reads = 0;
  private writes = 0;
  private recursiveCalls = 0;
  private readonly extra: Record<string, number> = {};

  constructor(options: MatrixSceneOptions) {
    this.rows = options.rowHeaders.length;
    this.cols = options.colHeaders.length;
    if (this.rows === 0 || this.cols === 0) throw new RangeError('A matrix needs at least one row and one column');
    this.rowHeaders = Object.freeze([...options.rowHeaders]);
    this.colHeaders = Object.freeze([...options.colHeaders]);
    this.rowTitle = options.rowTitle;
    this.colTitle = options.colTitle;
    this.values = new Array<number | null>(this.rows * this.cols).fill(null);
  }

  private index(row: number, col: number): number {
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= this.rows || col >= this.cols) {
      throw new RangeError(`Cell (${row}, ${col}) is outside a ${this.rows} x ${this.cols} matrix`);
    }
    return row * this.cols + col;
  }

  /* ---------------- counted state ---------------- */

  /** A counted read. Reading a cell that has not been computed is a bug in the generator. */
  read(row: number, col: number): number {
    const value = this.values[this.index(row, col)];
    if (value === null || value === undefined) throw new Error(`Cell (${row}, ${col}) is read before it is computed`);
    this.reads += 1;
    return value;
  }

  /** Uncounted, for explanations and for checks the algorithm itself does not make. */
  peek(row: number, col: number): number | null {
    return this.values[this.index(row, col)] ?? null;
  }

  write(row: number, col: number, value: number): void {
    const at = this.index(row, col);
    if (!Number.isFinite(value)) throw new RangeError(`Cell (${row}, ${col}) must hold a finite number`);
    if (this.values[at] === null) this.bump('cells filled');
    this.values[at] = value;
    this.writes += 1;
    this.cellsCache = null;
  }

  isFilled(row: number, col: number): boolean {
    return this.values[this.index(row, col)] !== null;
  }

  /** Extend the traceback by one cell. */
  walk(row: number, col: number): void {
    this.index(row, col);
    this.walked.push({ row, col });
    this.pathCache = null;
  }

  clearPath(): void {
    if (this.walked.length === 0) return;
    this.walked.length = 0;
    this.pathCache = NO_PATH;
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
      reads: this.reads,
      writes: this.writes,
      recursiveCalls: this.recursiveCalls,
      extra: { ...this.extra },
    };
  }

  /* ---------------- frames ---------------- */

  private cellsSnapshot(): readonly (number | null)[] {
    if (this.cellsCache === null) this.cellsCache = Object.freeze([...this.values]);
    return this.cellsCache;
  }

  private pathSnapshot(): readonly MatrixCell[] {
    if (this.pathCache === null) this.pathCache = Object.freeze(this.walked.map((cell) => Object.freeze({ ...cell })));
    return this.pathCache;
  }

  private stackSnapshot(): readonly CallStackEntry[] {
    if (this.stack.length === 0) return NO_STACK;
    if (this.stackCache === null) this.stackCache = Object.freeze([...this.stack]);
    return this.stackCache;
  }

  /** The table as it stands, for a frame of its own or a pane of a split frame. */
  snapshot(arrows: readonly MatrixArrow[] = NO_ARROWS, strips: readonly Strip[] = NO_STRIPS): MatrixSnapshot {
    for (const arrow of arrows) {
      this.index(arrow.from.row, arrow.from.col);
      this.index(arrow.to.row, arrow.to.col);
    }
    return {
      kind: 'matrix',
      rows: this.rows,
      cols: this.cols,
      cells: this.cellsSnapshot(),
      rowHeaders: this.rowHeaders,
      colHeaders: this.colHeaders,
      rowTitle: this.rowTitle,
      colTitle: this.colTitle,
      arrows: arrows.length === 0 ? NO_ARROWS : Object.freeze([...arrows]),
      path: this.pathSnapshot(),
      strips,
    };
  }

  /** The call stack as it stands, shared until it changes. */
  callStack(): readonly CallStackEntry[] {
    return this.stackSnapshot();
  }

  frame(input: MatrixFrameInput): Frame {
    return {
      structure: this.snapshot(input.arrows, input.strips),
      highlights: input.highlights ?? {},
      pointers: input.pointers ?? NO_POINTERS,
      callStack: this.callStack(),
      explanation: input.explanation,
      codeLine: input.codeLine,
      counters: this.counters(),
      ...(input.phase === undefined ? {} : { phase: input.phase }),
    };
  }
}
