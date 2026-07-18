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
import { kadane } from './kadane';

function solve(values: readonly number[]): readonly Frame[] {
  return runFrames(kadane, { input: values.join(',') });
}

function bestSpan(frames: readonly Frame[]): { from: number; to: number; sum: number } {
  const final = lastFrame(frames);
  const indices = (final.highlights.sorted ?? [])
    .filter((id): id is number => typeof id === 'number')
    .sort((a, b) => a - b);

  const values = valuesOf(final);
  const from = indices[0] ?? 0;
  const to = indices[indices.length - 1] ?? 0;
  let sum = 0;
  for (let i = from; i <= to; i++) sum += values[i] ?? 0;
  return { from, to, sum };
}

function bruteForce(values: readonly number[]): number {
  let best = -Infinity;
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    for (let j = i; j < values.length; j++) {
      sum += values[j] ?? 0;
      if (sum > best) best = sum;
    }
  }
  return best;
}

describe('kadane: correctness', () => {
  it('solves the textbook input', () => {
    const frames = solve([-2, 1, -3, 4, -1, 2, 1, -5, 4]);
    const best = bestSpan(frames);
    expect(best.sum).toBe(6);
    expect(best.from).toBe(3);
    expect(best.to).toBe(6);
  });

  it('agrees with brute force across random inputs', () => {
    const rng = makeRng(20260912);
    for (let trial = 0; trial < 200; trial++) {
      const size = 1 + Math.floor(rng() * 30);
      const values = Array.from({ length: size }, () => Math.floor(rng() * 21) - 10);
      expect(bestSpan(solve(values)).sum, `values=${values.join(',')}`).toBe(bruteForce(values));
    }
  });

  it('returns the least-negative element when everything is negative', () => {
    const values = [-8, -3, -6, -2, -9];
    const best = bestSpan(solve(values));
    expect(best.sum).toBe(-2);
    expect(best.from).toBe(3);
    expect(best.to).toBe(3);
  });

  it('takes the whole array when everything is positive', () => {
    const values = [3, 1, 4, 1, 5, 9, 2, 6];
    const best = bestSpan(solve(values));
    expect(best.sum).toBe(31);
    expect(best.from).toBe(0);
    expect(best.to).toBe(values.length - 1);
  });

  it('handles a single element', () => {
    expect(bestSpan(solve([7])).sum).toBe(7);
    expect(bestSpan(solve([-7])).sum).toBe(-7);
  });

  it('finds a spike buried in negatives', () => {
    const values = [-5, -2, -8, 47, -3, -6, -1];
    const best = bestSpan(solve(values));
    expect(best.sum).toBe(47);
    expect(best.from).toBe(3);
    expect(best.to).toBe(3);
  });

  it('reports a span that actually sums to the reported answer', () => {
    const rng = makeRng(5);
    for (let trial = 0; trial < 60; trial++) {
      const size = 2 + Math.floor(rng() * 20);
      const values = Array.from({ length: size }, () => Math.floor(rng() * 17) - 8);
      const best = bestSpan(solve(values));
      let sum = 0;
      for (let i = best.from; i <= best.to; i++) sum += values[i] ?? 0;
      expect(sum).toBe(best.sum);
      expect(best.from).toBeLessThanOrEqual(best.to);
    }
  });
});

describe('kadane: operation counts', () => {
  it('reads each element exactly once', () => {
    for (const size of [5, 40, 200]) {
      const values = Array.from({ length: size }, (_, index) => ((index * 7) % 13) - 6);
      const counters = lastFrame(solve(values)).counters;
      expect(counters.reads, `n=${size}`).toBe(size);
    }
  });

  it('makes two comparisons per step, not a quadratic scan', () => {
    const size = 200;
    const values = Array.from({ length: size }, (_, index) => ((index * 3) % 11) - 5);
    const counters = lastFrame(solve(values)).counters;
    expect(counters.comparisons).toBe(2 * (size - 1));
    expect(counters.swaps).toBe(0);
  });
});

describe('kadane: frame hygiene', () => {
  it('holds every structural invariant', () => {
    expectFrameHygiene(kadane, solve([-2, 1, -3, 4, -1, 2, 1, -5, 4]));
  });

  it('holds them on an all-negative array', () => {
    expectFrameHygiene(kadane, solve([-4, -1, -9, -2]));
  });

  it('is deterministic', () => {
    expectDeterministic(kadane, { input: '-2,1,-3,4,-1,2,1,-5,4' });
  });

  it('honours its input contract', () => {
    expectInputContract(kadane);
  });

  it('runs every preset', () => {
    for (const preset of kadane.presets) {
      const params = preset.build(20, makeRng(12));
      expect(kadane.build(params).ok, `preset=${preset.id}`).toBe(true);
    }
  });
});
