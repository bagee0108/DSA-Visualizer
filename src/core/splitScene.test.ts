import { describe, expect, it } from 'vitest';

import { expectFrameHygiene, paneOf, runFrames, splitOf } from '../algorithms/frameHygiene';
import { defineAlgorithm } from './define';
import { cellRef, colRef, MatrixScene, rowRef } from './matrixScene';
import { paneRef, parsePaneRef, SplitScene } from './splitScene';
import type { Frame } from './types';

function table(rows: number, cols: number): MatrixScene {
  return new MatrixScene({
    rowHeaders: Array.from({ length: rows }, (_, i) => `r${i}`),
    colHeaders: Array.from({ length: cols }, (_, j) => String(j)),
    rowTitle: 'i',
    colTitle: 'w',
  });
}

describe('pane refs', () => {
  it('round-trip through parsePaneRef', () => {
    expect(parsePaneRef(paneRef('table', cellRef(2, 3)))).toEqual({ pane: 'table', ref: 'cell:2:3' });
    expect(parsePaneRef(paneRef('row-1', colRef(0)))).toEqual({ pane: 'row-1', ref: 'col:0' });
  });

  it('reject anything else', () => {
    for (const junk of ['cell:1:2', '/cell:1:2', 'Table/cell:1:2', 'output:x', '']) expect(parsePaneRef(junk), junk).toBeNull();
  });
});

describe('SplitScene', () => {
  it('refuses a single pane, a duplicate id and a malformed one', () => {
    expect(() => new SplitScene([{ id: 'table', title: 'table', scene: table(2, 2) }])).toThrow(RangeError);
    expect(
      () =>
        new SplitScene([
          { id: 'table', title: 'a', scene: table(2, 2) },
          { id: 'table', title: 'b', scene: table(1, 2) },
        ]),
    ).toThrow(RangeError);
    expect(
      () =>
        new SplitScene([
          { id: 'Table', title: 'a', scene: table(2, 2) },
          { id: 'row', title: 'b', scene: table(1, 2) },
        ]),
    ).toThrow(RangeError);
  });

  it('snapshots every pane, in order, with its arrows', () => {
    const grid = table(3, 4);
    const row = table(1, 4);
    const split = new SplitScene([
      { id: 'table', title: 'full table', scene: grid },
      { id: 'row', title: 'rolling row', scene: row },
    ]);
    grid.write(0, 0, 5);
    row.write(0, 0, 5);
    const frame = split.frame({
      explanation: 'both',
      codeLine: 1,
      arrows: { table: [{ from: { row: 0, col: 0 }, to: { row: 1, col: 1 } }] },
    });
    const structure = splitOf(frame);
    expect(structure.panes.map((pane) => [pane.id, pane.title])).toEqual([['table', 'full table'], ['row', 'rolling row']]);
    expect(Object.isFrozen(structure.panes)).toBe(true);
    expect(paneOf(frame, 'table').arrows).toHaveLength(1);
    expect(paneOf(frame, 'row').arrows).toHaveLength(0);
    expect(paneOf(frame, 'row').cells[0]).toBe(5);
  });

  it('refuses arrows for a pane it does not have', () => {
    const split = new SplitScene([
      { id: 'table', title: 'a', scene: table(2, 2) },
      { id: 'row', title: 'b', scene: table(1, 2) },
    ]);
    expect(() => split.frame({ explanation: 'x', codeLine: 0, arrows: { nope: [] } })).toThrow(RangeError);
  });

  it('adds the panes counters, so splitting a run does not change its totals', () => {
    const grid = table(2, 2);
    const row = table(1, 2);
    const split = new SplitScene([
      { id: 'table', title: 'a', scene: grid },
      { id: 'row', title: 'b', scene: row },
    ]);
    grid.write(0, 0, 1);
    grid.write(0, 1, 2);
    row.write(0, 0, 1);
    grid.read(0, 1);
    row.countComparison(3);
    const { counters } = split.frame({ explanation: 'x', codeLine: 0 });
    expect(counters.writes).toBe(3);
    expect(counters.reads).toBe(1);
    expect(counters.comparisons).toBe(3);
    expect(counters.extra['cells filled']).toBe(3);
  });

  it('shares an unchanged pane between frames', () => {
    const grid = table(2, 2);
    const row = table(1, 2);
    const split = new SplitScene([
      { id: 'table', title: 'a', scene: grid },
      { id: 'row', title: 'b', scene: row },
    ]);
    const first = split.frame({ explanation: 'x', codeLine: 0 });
    row.write(0, 1, 4);
    const second = split.frame({ explanation: 'y', codeLine: 0 });
    expect(paneOf(second, 'table').cells).toBe(paneOf(first, 'table').cells);
    expect(paneOf(second, 'row').cells).not.toBe(paneOf(first, 'row').cells);
  });
});

/** A two-pane run small enough to reason about: a table filled row by row, and the row it rolls into. */
const fixture = defineAlgorithm<{ bad: string }>({
  meta: {
    id: 'split-fixture',
    name: 'Split fixture',
    category: 'dynamic-programming',
    structureKind: 'split',
    blurb: 'test',
    complexity: { time: { best: '1', average: '1', worst: '1' }, space: '1' },
    code: 'line one\nline two',
    trackedCounters: ['writes'],
  },
  fields: [{ key: 'bad', label: 'Bad', kind: 'text', defaultValue: '' }],
  parse: (params) => ({ ok: true, value: { bad: params.bad ?? '' } }),
  *run({ bad }) {
    const grid = table(2, 3);
    const row = table(1, 3);
    const split = new SplitScene([
      { id: 'table', title: 'full table', scene: grid },
      { id: 'row', title: 'rolling row', scene: row },
    ]);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) {
        grid.write(i, j, i + j);
        row.write(0, j, i + j);
        yield split.frame({
          explanation: `fill ${i},${j}`,
          codeLine: 1,
          highlights: { active: [paneRef('table', cellRef(i, j)), paneRef('row', cellRef(0, j))] },
          pointers: { i: paneRef('table', rowRef(i)), w: bad === 'pointer' ? colRef(j) : paneRef('row', colRef(j)) },
          strips: [{ kind: 'output', label: 'out', items: [{ id: 'x', label: 'x' }] }],
        });
      }
    }
  },
});

describe('split frame hygiene', () => {
  it('holds for a well-formed run', () => {
    const frames: readonly Frame[] = runFrames(fixture, {});
    expect(frames).toHaveLength(6);
    expectFrameHygiene(fixture, frames);
  });

  it('catches a ref that does not name its pane', () => {
    expect(() => expectFrameHygiene(fixture, runFrames(fixture, { bad: 'pointer' }))).toThrow();
  });
});
