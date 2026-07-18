import { describe, expect, it } from 'vitest';

import { makeRng } from '../../core/random';
import type { Frame } from '../../core/types';
import {
  expectDeterministic,
  expectFrameHygiene,
  expectInputContract,
  lastFrame,
  runFrames,
} from '../frameHygiene';
import { slidingWindow } from './slidingWindow';

function solve(values: readonly number[], limit: number): readonly Frame[] {
  return runFrames(slidingWindow, { input: values.join(','), limit: String(limit) });
}

function bestLength(frames: readonly Frame[]): number {
  const sorted = lastFrame(frames).highlights.sorted ?? [];
  return sorted.length;
}

function bruteForce(values: readonly number[], limit: number): number {
  let best = 0;
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    for (let j = i; j < values.length; j++) {
      sum += values[j] ?? 0;
      if (sum > limit) break;
      best = Math.max(best, j - i + 1);
    }
  }
  return best;
}

describe('sliding window: correctness', () => {
  it('matches the brute force answer on the default input', () => {
    const values = [4, 2, 9, 1, 3, 8, 2, 5, 6, 1, 7, 3];
    expect(bestLength(solve(values, 15))).toBe(bruteForce(values, 15));
  });

  it('agrees with brute force across random inputs and limits', () => {
    const rng = makeRng(99001);
    for (let trial = 0; trial < 150; trial++) {
      const size = 1 + Math.floor(rng() * 30);
      const values = Array.from({ length: size }, () => Math.floor(rng() * 15));
      const limit = Math.floor(rng() * 60);
      expect(bestLength(solve(values, limit)), `limit=${limit} values=${values.join(',')}`).toBe(
        bruteForce(values, limit),
      );
    }
  });

  it('handles the degenerate cases', () => {
    expect(bestLength(solve([10, 20, 30], 5))).toBe(0);
    expect(bestLength(solve([1, 1, 1, 1], 100))).toBe(4);
    expect(bestLength(solve([0, 0, 0, 9], 0))).toBe(3);
  });

  it('rejects negative values with a reason, since the method is unsound there', () => {
    const result = slidingWindow.build({ input: '3, -2, 5', limit: '4' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/non-negative/i);
      expect(result.error).toMatch(/a\[1\] = -2/);
    }
  });

  it('rejects a negative limit', () => {
    expect(slidingWindow.build({ input: '1,2,3', limit: '-1' }).ok).toBe(false);
  });
});

describe('sliding window: the monotone cursors', () => {
  const frames = solve([4, 2, 9, 1, 3, 8, 2, 5, 6, 1, 7, 3], 15);

  it('never moves left backwards - this is why it is linear, not quadratic', () => {
    let furthest = -1;
    for (const frame of frames) {
      const left = frame.pointers.left;
      if (left === undefined) continue;
      expect(left).toBeGreaterThanOrEqual(furthest);
      furthest = left;
    }
  });

  it('never moves right backwards', () => {
    let furthest = -1;
    for (const frame of frames) {
      const right = frame.pointers.right;
      if (right === undefined) continue;
      expect(right).toBeGreaterThanOrEqual(furthest);
      furthest = right;
    }
  });

  it('keeps left at or behind right', () => {
    for (const frame of frames) {
      const { left, right } = frame.pointers;
      if (left === undefined || right === undefined) continue;
      expect(left).toBeLessThanOrEqual(right + 1);
    }
  });

  it('reads each element at most twice, added once and removed once', () => {
    for (const size of [10, 60, 200]) {
      const values = Array.from({ length: size }, (_, index) => (index % 7) + 1);
      const counters = lastFrame(solve(values, 10)).counters;
      expect(counters.reads, `n=${size}`).toBeLessThanOrEqual(2 * size);
    }
  });
});

describe('sliding window: frame hygiene', () => {
  it('holds every structural invariant', () => {
    expectFrameHygiene(slidingWindow, solve([4, 2, 9, 1, 3, 8, 2, 5, 6], 12));
  });

  it('holds them when nothing fits', () => {
    expectFrameHygiene(slidingWindow, solve([50, 60, 70], 10));
  });

  it('is deterministic', () => {
    expectDeterministic(slidingWindow, { input: '4,2,9,1,3', limit: '10' });
  });

  it('honours its input contract', () => {
    expectInputContract(slidingWindow);
  });

  it('runs every preset', () => {
    for (const preset of slidingWindow.presets) {
      const params = preset.build(20, makeRng(4));
      expect(slidingWindow.build(params).ok, `preset=${preset.id}`).toBe(true);
    }
  });
});
