import { describe, expect, it } from 'vitest';

import { makeRng, randomInt } from '../../core/random';
import type { Frame } from '../../core/types';
import { expectDeterministic, expectFrameHygiene, expectInputContract, lastFrame, paneOf, runFrames, splitOf } from '../frameHygiene';
import { knapsack, MAX_CAPACITY, MAX_ITEMS } from './knapsack';

function solve(weights: readonly number[], values: readonly number[], capacity: number): readonly Frame[] {
  return runFrames(knapsack, { weights: weights.join(','), values: values.join(','), capacity: String(capacity) });
}

function bestOf(frames: readonly Frame[]): number | null {
  const row = paneOf(lastFrame(frames), 'row');
  return row.cells[row.cells.length - 1] ?? null;
}

/** Indices of the taken items, read back from the chip labels. */
function takenOf(frames: readonly Frame[]): number[] {
  const strip = splitOf(lastFrame(frames)).strips.find((candidate) => candidate.label === 'taken');
  return (strip?.items ?? []).map((item) => 'ABCDEFGH'.indexOf(String(item.id)));
}

/** Every subset, by brute force: a different formulation from the table. */
function reference(weights: readonly number[], values: readonly number[], capacity: number): number {
  let best = 0;
  for (let mask = 0; mask < 1 << weights.length; mask++) {
    let weight = 0;
    let value = 0;
    for (let at = 0; at < weights.length; at++) {
      if ((mask & (1 << at)) === 0) continue;
      weight += weights[at] ?? 0;
      value += values[at] ?? 0;
    }
    if (weight <= capacity) best = Math.max(best, value);
  }
  return best;
}

describe('knapsack: correctness', () => {
  it('solves the textbook cases', () => {
    expect(bestOf(solve([1, 3, 4, 5], [1, 4, 5, 7], 7))).toBe(9);
    expect(bestOf(solve([1, 2, 3], [6, 10, 12], 5))).toBe(22);
    expect(takenOf(solve([1, 2, 3], [6, 10, 12], 5))).toEqual([1, 2]);
  });

  it('agrees with brute force, and the items it takes fit and add up', () => {
    const rng = makeRng(20261014);
    for (let trial = 0; trial < 200; trial++) {
      const count = randomInt(rng, 1, MAX_ITEMS);
      const capacity = randomInt(rng, 1, MAX_CAPACITY);
      const weights = Array.from({ length: count }, () => randomInt(rng, 1, MAX_CAPACITY));
      const values = Array.from({ length: count }, () => randomInt(rng, 0, 30));
      const frames = solve(weights, values, capacity);
      const taken = takenOf(frames);
      const label = `w=${weights.join(',')} v=${values.join(',')} W=${capacity}`;
      expect(bestOf(frames), label).toBe(reference(weights, values, capacity));
      expect(new Set(taken).size, label).toBe(taken.length);
      expect(taken.reduce((sum, at) => sum + (weights[at] ?? 0), 0), label).toBeLessThanOrEqual(capacity);
      expect(taken.reduce((sum, at) => sum + (values[at] ?? 0), 0), label).toBe(reference(weights, values, capacity));
    }
  });

  it('leaves the bag empty when nothing fits', () => {
    const frames = solve([5, 6], [10, 20], 4);
    expect(bestOf(frames)).toBe(0);
    expect(takenOf(frames)).toEqual([]);
  });

  it('keeps the rolling row equal to the last finished table row', () => {
    const weights = [2, 3, 1, 4, 2];
    const values = [3, 4, 2, 6, 3];
    const frames = solve(weights, values, 8);
    let finished = 0;
    for (const frame of frames) {
      if (frame.phase !== 'fill' || !frame.explanation.startsWith('Row ')) continue;
      finished += 1;
      const table = paneOf(frame, 'table');
      const row = paneOf(frame, 'row');
      expect(table.cells.slice(finished * table.cols, (finished + 1) * table.cols), `row ${finished}`).toEqual(row.cells);
    }
    expect(finished).toBe(weights.length);
  });

  it('walks the traceback up one row at a time, never right', () => {
    const { path } = paneOf(lastFrame(solve([1, 3, 4, 5], [1, 4, 5, 7], 7)), 'table');
    expect(path[0]).toEqual({ row: 4, col: 7 });
    expect(path[path.length - 1]?.row).toBe(0);
    for (let at = 1; at < path.length; at++) {
      expect(path[at]?.row).toBe((path[at - 1]?.row ?? 0) - 1);
      expect(path[at]?.col).toBeLessThanOrEqual(path[at - 1]?.col ?? 0);
    }
  });
});

describe('knapsack: operation counts', () => {
  it('fills every table cell and every rolling cell exactly once', () => {
    for (const [weights, capacity] of [[[1, 3, 4, 5], 7], [[9, 9], 4], [[1, 1, 1, 1, 1, 1, 1, 1], 12]] as const) {
      const counters = lastFrame(solve(weights, weights, capacity)).counters;
      expect(counters.extra['cells filled']).toBe((weights.length + 1) * (capacity + 1) + capacity + 1);
    }
  });

  it('compares once per fitting cell in each version, then once per item on the way back', () => {
    const weights = [1, 3, 4, 5];
    const capacity = 7;
    const fitting = weights.reduce((sum, weight) => sum + Math.max(0, capacity - weight + 1), 0);
    expect(lastFrame(solve(weights, [1, 4, 5, 7], capacity)).counters.comparisons).toBe(2 * fitting + weights.length);
  });
});

describe('knapsack: frame hygiene', () => {
  it('holds every structural invariant', () => {
    expectFrameHygiene(knapsack, solve([1, 3, 4, 5], [1, 4, 5, 7], 7));
  });

  it('holds them at the caps and on one item', () => {
    expectFrameHygiene(knapsack, solve([1, 2, 3, 4, 5, 6, 7, 8], [8, 7, 6, 5, 4, 3, 2, 1], MAX_CAPACITY));
    expectFrameHygiene(knapsack, solve([1], [5], 1));
    expectFrameHygiene(knapsack, solve([MAX_CAPACITY], [5], 3));
  });

  it('is deterministic', () => {
    expectDeterministic(knapsack, { weights: '1, 3, 4, 5', values: '1, 4, 5, 7', capacity: '7' });
  });

  it('honours its input contract', () => {
    expectInputContract(knapsack);
  });

  it('rejects bad input', () => {
    const build = (weights: string, values: string, capacity: string): boolean => knapsack.build({ weights, values, capacity }).ok;
    expect(build('1, 2', '3', '5')).toBe(false);
    expect(build('0, 2', '3, 4', '5')).toBe(false);
    expect(build('1.5, 2', '3, 4', '5')).toBe(false);
    expect(build('1, 2', '3, -4', '5')).toBe(false);
    expect(build('1, 2', '3, 4', '0')).toBe(false);
    expect(build('1, 2', '3, 4', String(MAX_CAPACITY + 1))).toBe(false);
    expect(build('1,1,1,1,1,1,1,1,1', '1,1,1,1,1,1,1,1,1', '5')).toBe(false);
    expect(build('', '', '5')).toBe(false);
  });

  it('runs every preset at every size', () => {
    for (const preset of knapsack.presets) {
      for (const size of [knapsack.sizeRange.min, 4, knapsack.sizeRange.max]) {
        const params = preset.build(size, makeRng(size));
        expect(knapsack.build(params).ok, `preset=${preset.id} size=${size}`).toBe(true);
      }
    }
  });
});
