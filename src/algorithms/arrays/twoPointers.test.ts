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
import { twoPointers } from './twoPointers';

function solve(values: readonly number[], target: number): readonly Frame[] {
  return runFrames(twoPointers, { input: values.join(','), target: String(target) });
}

function pairFound(frames: readonly Frame[]): readonly number[] | null {
  const final = lastFrame(frames);
  if (final.phase !== 'found') return null;
  return (final.highlights.sorted ?? []).filter((id): id is number => typeof id === 'number');
}

function hasPair(values: readonly number[], target: number): boolean {
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      if ((values[i] ?? 0) + (values[j] ?? 0) === target) return true;
    }
  }
  return false;
}

describe('two pointers: correctness', () => {
  it('returns a genuine pair when one exists', () => {
    const values = [2, 7, 11, 15, 19, 24, 31, 38, 42, 55];
    for (const target of [9, 53, 97, 26, 13]) {
      const frames = solve(values, target);
      const pair = pairFound(frames);
      expect(pair, `target ${target}`).not.toBeNull();
      if (pair === null) continue;
      expect(pair).toHaveLength(2);
      const sorted = valuesOf(lastFrame(frames));
      expect((sorted[pair[0] ?? 0] ?? 0) + (sorted[pair[1] ?? 0] ?? 0)).toBe(target);
    }
  });

  it('agrees with the brute force answer on random inputs', () => {
    const rng = makeRng(777);
    for (let trial = 0; trial < 150; trial++) {
      const size = 2 + Math.floor(rng() * 24);
      const values = Array.from({ length: size }, () => Math.floor(rng() * 40) - 10).sort((a, b) => a - b);
      const target = Math.floor(rng() * 60) - 15;

      const frames = solve(values, target);
      const pair = pairFound(frames);
      expect(pair !== null, `target=${target} values=${values.join(',')}`).toBe(hasPair(values, target));

      if (pair !== null) {
        expect((values[pair[0] ?? 0] ?? 0) + (values[pair[1] ?? 0] ?? 0)).toBe(target);
      }
    }
  });

  it('reports no pair when none exists', () => {
    const frames = solve([1, 2, 3, 4], 100);
    expect(lastFrame(frames).phase).toBe('not found');
    expect(pairFound(frames)).toBeNull();
  });

  it('never pairs an element with itself', () => {
    const frames = solve([1, 5, 10, 18], 20);
    expect(lastFrame(frames).phase).toBe('not found');
  });

  it('sorts unsorted input first', () => {
    const frames = solve([31, 2, 15, 7], 9);
    expect(valuesOf(lastFrame(frames))).toEqual([2, 7, 15, 31]);
    expect(frames[0]?.explanation).toMatch(/sorted first/i);
    expect(pairFound(frames)).not.toBeNull();
  });
});

describe('two pointers: operation counts', () => {
  it('retires one index per step, so it stays linear', () => {
    for (const size of [10, 50, 200]) {
      const values = Array.from({ length: size }, (_, index) => index);
      const counters = lastFrame(solve(values, -5)).counters;
      expect(counters.reads, `n=${size}`).toBeLessThanOrEqual(2 * size);
      expect(counters.comparisons, `n=${size}`).toBeLessThanOrEqual(2 * size);
    }
  });

  it('beats the quadratic scan it replaces', () => {
    const size = 200;
    const values = Array.from({ length: size }, (_, index) => index);
    const counters = lastFrame(solve(values, -1)).counters;
    expect(counters.comparisons).toBeLessThan((size * (size - 1)) / 2);
  });
});

describe('two pointers: frame hygiene', () => {
  it('holds every structural invariant on a hit', () => {
    expectFrameHygiene(twoPointers, solve([2, 7, 11, 15, 19], 26));
  });

  it('holds every structural invariant on a miss', () => {
    expectFrameHygiene(twoPointers, solve([2, 7, 11, 15, 19], 1000));
  });

  it('moves l forward and r backward, never the reverse', () => {
    const frames = solve([1, 3, 5, 7, 9, 11, 13], 40);
    let lowest = -1;
    let highest = Infinity;
    for (const frame of frames) {
      const l = frame.pointers.l;
      const r = frame.pointers.r;
      if (l !== undefined) {
        expect(l).toBeGreaterThanOrEqual(lowest);
        lowest = l;
      }
      if (r !== undefined) {
        expect(r).toBeLessThanOrEqual(highest);
        highest = r;
      }
    }
  });

  it('is deterministic', () => {
    expectDeterministic(twoPointers, { input: '2,7,11,15', target: '18' });
  });

  it('honours its input contract', () => {
    expectInputContract(twoPointers);
  });

  it('needs at least two elements', () => {
    expect(twoPointers.build({ input: '5', target: '5' }).ok).toBe(false);
  });
});
