import { describe, expect, it } from 'vitest';

import { makeRng } from '../../core/random';
import type { Frame } from '../../core/types';
import {
  expectDeterministic,
  expectFrameHygiene,
  expectInputContract,
  lastFrame,
  runFrames,
  valuesOf,
} from '../frameHygiene';
import { binarySearch } from './binarySearch';

function outcome(frames: readonly Frame[]): { found: boolean; index: number } {
  const final = lastFrame(frames);
  if (final.phase === 'found') {
    const sorted = final.highlights.sorted ?? [];
    const index = sorted[0];
    return { found: true, index: typeof index === 'number' ? index : -1 };
  }
  return { found: false, index: -1 };
}

function search(values: readonly number[], target: number): readonly Frame[] {
  return runFrames(binarySearch, { input: values.join(','), target: String(target) });
}

describe('binary search: correctness', () => {
  it('finds every element of a sorted array at its own index', () => {
    const values = [3, 8, 12, 19, 24, 31, 45, 52, 66, 70, 88, 91];
    for (const [index, value] of values.entries()) {
      const result = outcome(search(values, value));
      expect(result.found, `target ${value}`).toBe(true);
      expect(result.index, `target ${value}`).toBe(index);
    }
  });

  it('reports a miss for values that are absent', () => {
    const values = [3, 8, 12, 19, 24];
    for (const target of [0, 4, 11, 20, 99, -7]) {
      expect(outcome(search(values, target)).found, `target ${target}`).toBe(false);
    }
  });

  it('agrees with indexOf across random sorted arrays', () => {
    const rng = makeRng(8642);
    for (let trial = 0; trial < 120; trial++) {
      const size = 1 + Math.floor(rng() * 40);
      const pool = new Set<number>();
      while (pool.size < size) pool.add(Math.floor(rng() * 400) - 200);
      const values = [...pool].sort((a, b) => a - b);

      const target = rng() < 0.6 ? (values[Math.floor(rng() * size)] ?? 0) : Math.floor(rng() * 400) - 200;
      const expectedIndex = values.indexOf(target);
      const result = outcome(search(values, target));

      expect(result.found).toBe(expectedIndex >= 0);
      if (expectedIndex >= 0) expect(result.index).toBe(expectedIndex);
    }
  });

  it('sorts an unsorted input rather than searching garbage', () => {
    const frames = search([9, 1, 7, 3, 5], 7);
    expect(valuesOf(lastFrame(frames))).toEqual([1, 3, 5, 7, 9]);
    expect(frames[0]?.explanation).toMatch(/not sorted/i);
    expect(outcome(frames).found).toBe(true);
  });
});

describe('binary search: operation counts', () => {
  it('never exceeds two comparisons per halving', () => {
    const rng = makeRng(24);
    for (const size of [1, 2, 7, 16, 100, 200]) {
      const values = Array.from({ length: size }, (_, index) => index * 2);
      const target = rng() < 0.5 ? -1 : size * 2 + 1;
      const counters = lastFrame(search(values, target)).counters;
      const iterations = Math.floor(Math.log2(size)) + 1;
      expect(counters.comparisons, `n=${size}`).toBeLessThanOrEqual(2 * iterations);
    }
  });

  it('costs a miss about the same as a hit', () => {
    const values = Array.from({ length: 128 }, (_, index) => index * 3);
    const hit = lastFrame(search(values, 3 * 127)).counters.comparisons;
    const miss = lastFrame(search(values, 3 * 128 + 1)).counters.comparisons;
    expect(Math.abs(hit - miss)).toBeLessThanOrEqual(8);
  });

  it('scales logarithmically, not linearly', () => {
    const small = lastFrame(search(Array.from({ length: 16 }, (_, i) => i), -1)).counters.comparisons;
    const large = lastFrame(search(Array.from({ length: 200 }, (_, i) => i), -1)).counters.comparisons;
    expect(large).toBeLessThan(small * 3);
  });
});

describe('binary search: frame hygiene', () => {
  it('holds every structural invariant on a hit', () => {
    expectFrameHygiene(binarySearch, search([1, 4, 9, 16, 25, 36, 49], 25));
  });

  it('holds every structural invariant on a miss', () => {
    expectFrameHygiene(binarySearch, search([1, 4, 9, 16, 25, 36, 49], 26));
  });

  it('marks the terminal frame with a phase', () => {
    expect(lastFrame(search([1, 2, 3], 2)).phase).toBe('found');
    expect(lastFrame(search([1, 2, 3], 5)).phase).toBe('not found');
  });

  it('is deterministic', () => {
    expectDeterministic(binarySearch, { input: '1,5,9,13,17', target: '13' });
  });

  it('honours its input contract', () => {
    expectInputContract(binarySearch);
  });

  it('rejects a non-numeric target', () => {
    const result = binarySearch.build({ input: '1,2,3', target: 'abc' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/target must be a number/i);
  });
});
