import { describe, expect, it } from 'vitest';

import { expectFrameHygiene, matrixOf, runFrames } from '../algorithms/frameHygiene';
import { defineAlgorithm } from './define';
import { cellRef, colRef, MatrixScene, parseMatrixRef, rowRef } from './matrixScene';
import type { Frame } from './types';

function scene(rows = 3, cols = 4): MatrixScene {
  return new MatrixScene({
    rowHeaders: Array.from({ length: rows }, (_, i) => `r${i}`),
    colHeaders: Array.from({ length: cols }, (_, j) => `c${j}`),
    rowTitle: 'i',
    colTitle: 'j',
  });
}

describe('matrix refs', () => {
  it('round-trip through parseMatrixRef', () => {
    expect(parseMatrixRef(cellRef(2, 11))).toEqual({ kind: 'cell', row: 2, col: 11 });
    expect(parseMatrixRef(rowRef(0))).toEqual({ kind: 'row', index: 0 });
    expect(parseMatrixRef(colRef(7))).toEqual({ kind: 'col', index: 7 });
  });

  it('reject anything else', () => {
    for (const junk of ['cell:1', 'cell:-1:2', 'row:x', 'edge:3', 'queue:1', '']) expect(parseMatrixRef(junk), junk).toBeNull();
  });
});

describe('MatrixScene', () => {
  it('takes its shape from the headers and starts empty', () => {
    const table = scene(3, 4);
    expect([table.rows, table.cols]).toEqual([3, 4]);
    const snapshot = matrixOf(table.frame({ explanation: 'start', step: null }));
    expect(snapshot.cells).toHaveLength(12);
    expect(snapshot.cells.every((value) => value === null)).toBe(true);
    expect(snapshot.rowHeaders).toEqual(['r0', 'r1', 'r2']);
  });

  it('refuses an empty axis', () => {
    expect(() => new MatrixScene({ rowHeaders: [], colHeaders: ['a'], rowTitle: 'i', colTitle: 'j' })).toThrow(RangeError);
  });

  it('counts reads and writes, and each newly filled cell once', () => {
    const table = scene();
    table.write(0, 0, 1);
    table.write(0, 0, 2);
    table.write(1, 2, 5);
    expect(table.read(0, 0) + table.read(1, 2)).toBe(7);
    expect(table.peek(2, 3)).toBeNull();
    const counters = table.counters();
    expect([counters.reads, counters.writes]).toEqual([2, 3]);
    expect(counters.extra['cells filled']).toBe(2);
  });

  it('throws on a read before the cell is computed, off the table, or of a non-number', () => {
    const table = scene();
    expect(() => table.read(0, 0)).toThrow(/before it is computed/);
    expect(() => table.write(3, 0, 1)).toThrow(RangeError);
    expect(() => table.peek(0, -1)).toThrow(RangeError);
    expect(() => table.write(0, 0, Number.NaN)).toThrow(RangeError);
    expect(() => table.walk(0, 4)).toThrow(RangeError);
  });

  it('shares frozen snapshots between frames until something changes', () => {
    const table = scene();
    table.write(0, 0, 0);
    const a = matrixOf(table.frame({ explanation: 'a', step: null }));
    const b = matrixOf(table.frame({ explanation: 'b', step: null }));
    expect(b.cells).toBe(a.cells);
    expect(b.path).toBe(a.path);
    expect(b.rowHeaders).toBe(a.rowHeaders);
    expect(Object.isFrozen(a.cells)).toBe(true);

    table.write(0, 1, 1);
    table.walk(0, 1);
    const c = matrixOf(table.frame({ explanation: 'c', step: null }));
    expect(c.cells).not.toBe(b.cells);
    expect(b.cells[1]).toBeNull();
    expect(c.cells[1]).toBe(1);
    expect(c.path).toEqual([{ row: 0, col: 1 }]);
    expect(c.rowHeaders).toBe(a.rowHeaders);
  });

  it('keeps the traceback until it is cleared, and arrows for one frame only', () => {
    const table = scene();
    table.walk(2, 3);
    table.walk(1, 2);
    const arrows = [{ from: { row: 1, col: 2 }, to: { row: 2, col: 3 }, label: 'match' }];
    const shown = matrixOf(table.frame({ explanation: 'show', step: null, arrows }));
    expect(shown.arrows).toEqual(arrows);
    expect(Object.isFrozen(shown.arrows)).toBe(true);
    expect(shown.path).toEqual([{ row: 2, col: 3 }, { row: 1, col: 2 }]);

    const next = matrixOf(table.frame({ explanation: 'next', step: null }));
    expect(next.arrows).toEqual([]);
    expect(next.path).toBe(shown.path);

    table.clearPath();
    expect(matrixOf(table.frame({ explanation: 'cleared', step: null })).path).toEqual([]);
  });

  it('rejects an arrow that leaves the table', () => {
    const table = scene();
    expect(() =>
      table.frame({ explanation: 'bad', step: null, arrows: [{ from: { row: 0, col: 0 }, to: { row: 9, col: 0 } }] }),
    ).toThrow(RangeError);
  });
});

/** A small table run in the shape the DP generators will take: prefix sums of a grid. */
const probe = (mutate?: (frame: Frame) => Frame) =>
  defineAlgorithm<number>({
    meta: {
      id: 'matrix-probe',
      name: 'Matrix probe',
      category: 'dynamic-programming',
      structureKind: 'matrix',
      blurb: 'Test fixture.',
      complexity: { time: { best: 'O(nm)', average: 'O(nm)', worst: 'O(nm)' }, space: 'O(nm)' },
      code: 'for each cell\n  t[i][j] = t[i-1][j] + 1',
      stepLines: { each: 1, fill: 2 },
      trackedCounters: ['reads', 'writes'],
    },
    fields: [{ key: 'input', label: 'Size', kind: 'number', defaultValue: '3' }],
    parse: (params) => ({ ok: true, value: Number(params.input ?? 3) }),
    *run(size) {
      const table = scene(size, size);
      const emit = (frame: Frame): Frame => (mutate === undefined ? frame : mutate(frame));
      for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
          const above = i === 0 ? 0 : table.read(i - 1, j);
          table.write(i, j, above + 1);
          yield emit(
            table.frame({
              explanation: `Fill (${i}, ${j}).`,
              step: 'fill',
              highlights: { active: [cellRef(i, j)], comparing: [rowRef(i), colRef(j)] },
              pointers: { i: rowRef(i), j: colRef(j) },
              arrows: i === 0 ? [] : [{ from: { row: i - 1, col: j }, to: { row: i, col: j } }],
            }),
          );
        }
      }
      for (let i = size - 1; i >= 0; i--) {
        table.walk(i, size - 1);
        yield emit(table.frame({ explanation: `Walk back through row ${i}.`, step: 'each', highlights: { sorted: [cellRef(i, size - 1)] } }));
      }
    },
  });

describe('frame hygiene for matrix runs', () => {
  it('accepts a well-formed run', () => {
    const algorithm = probe();
    expectFrameHygiene(algorithm, runFrames(algorithm, { input: '4' }));
  });

  it('rejects a pointer or highlight that leaves the table', () => {
    const offTable = probe((frame) => ({ ...frame, pointers: { i: rowRef(99) } }));
    expect(() => expectFrameHygiene(offTable, runFrames(offTable, { input: '3' }))).toThrow(/pointer off the table/);

    const notARef = probe((frame) => ({ ...frame, highlights: { active: ['node:1'] } }));
    expect(() => expectFrameHygiene(notARef, runFrames(notARef, { input: '3' }))).toThrow(/highlight active off the table/);
  });

  it('rejects a table that changes shape mid-run', () => {
    let calls = 0;
    const reshaped = probe((frame) => {
      calls += 1;
      const structure = matrixOf(frame);
      return calls === 2 ? { ...frame, structure: { ...structure, rows: structure.rows + 1 } } : frame;
    });
    expect(() => expectFrameHygiene(reshaped, runFrames(reshaped, { input: '3' }))).toThrow(/shape is fixed/);
  });
});
