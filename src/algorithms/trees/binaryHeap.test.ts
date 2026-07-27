import { describe, expect, it } from 'vitest';

import { makeRng } from '../../core/random';
import type { Frame } from '../../core/types';
import { arrayOf, expectDeterministic, expectFrameHygiene, expectInputContract, lastFrame, runFrames, valuesOf } from '../frameHygiene';
import { binaryHeap } from './binaryHeap';

const HYGIENE = { allowSizeChange: true } as const;

function run(values: readonly number[], ops: string): readonly Frame[] {
  return runFrames(binaryHeap, { input: values.join(','), ops });
}

function isMaxHeap(values: readonly number[]): boolean {
  for (let i = 0; i < values.length; i++) {
    for (const child of [2 * i + 1, 2 * i + 2]) {
      if (child < values.length && (values[child] ?? -Infinity) > (values[i] ?? -Infinity)) return false;
    }
  }
  return true;
}

function settled(frames: readonly Frame[]): readonly Frame[] {
  return frames.filter((frame) => frame.callStack.length === 0 && (frame.phase === 'done' || /Return|maximum|Heap built|holds, stop|reached the root/.test(frame.explanation)));
}

describe('binary heap: the heap property', () => {
  it('holds after heapify and after every push and pop', () => {
    const frames = runFrames(binaryHeap, {});
    const checks = settled(frames);
    expect(checks.length).toBeGreaterThan(3);
    for (const frame of checks) expect(isMaxHeap(valuesOf(frame)), frame.explanation).toBe(true);
  });

  it('holds across random operation sequences', () => {
    const rng = makeRng(8080);
    for (let trial = 0; trial < 40; trial++) {
      const size = 1 + Math.floor(rng() * 14);
      const values = Array.from({ length: size }, () => Math.floor(rng() * 99));
      const ops = ['heapify'];
      for (let k = 0; k < 6; k++) ops.push(rng() < 0.5 ? `push ${Math.floor(rng() * 99)}` : 'pop');
      const frames = run(values, ops.join('; '));
      for (const frame of settled(frames)) expect(isMaxHeap(valuesOf(frame)), frame.explanation).toBe(true);
    }
  });

  it('marks the live prefix as the heap view on every frame', () => {
    for (const frame of run([5, 9, 2, 7], 'heapify; push 11; pop')) {
      const structure = arrayOf(frame);
      expect(structure.heap?.size).toBe(structure.elements.length);
    }
  });
});

describe('binary heap: pop order', () => {
  it('pops values in descending order', () => {
    const values = [12, 45, 7, 88, 23, 56, 9, 31, 64];
    const frames = run(values, 'heapify; pop; pop; pop; pop');
    const remaining = valuesOf(lastFrame(frames)).sort((a, b) => a - b);
    const expected = [...values].sort((a, b) => a - b).slice(0, values.length - 4);
    expect(remaining).toEqual(expected);
  });

  it('pushes then pops the maximum straight back out', () => {
    const frames = run([10, 8, 6], 'push 42; pop');
    expect(valuesOf(lastFrame(frames)).sort((a, b) => a - b)).toEqual([6, 8, 10]);
    expect(frames.some((frame) => /Return 42/.test(frame.explanation))).toBe(true);
  });

  it('builds a heap from an empty start by pushes alone', () => {
    const frames = run([], 'push 3; push 9; push 1; push 7');
    const final = valuesOf(lastFrame(frames));
    expect(final).toHaveLength(4);
    expect(final[0]).toBe(9);
    expect(isMaxHeap(final)).toBe(true);
  });

  it('pops an empty heap without dying', () => {
    const frames = run([], 'pop');
    expect(frames.some((frame) => /empty heap/.test(frame.explanation))).toBe(true);
  });
});

describe('binary heap: operation counts', () => {
  it('heapifies in at most 2n comparisons', () => {
    for (const n of [7, 15, 31, 63]) {
      const values = Array.from({ length: n }, (_, i) => i + 1);
      const frames = run(values, 'heapify');
      expect(lastFrame(frames).counters.comparisons).toBeLessThanOrEqual(2 * n);
    }
  });

  it('pushes in at most log2(n) + 1 comparisons', () => {
    const values = Array.from({ length: 31 }, (_, i) => 31 - i);
    const frames = run(values, 'push 99');
    expect(lastFrame(frames).counters.comparisons).toBeLessThanOrEqual(Math.floor(Math.log2(32)) + 1);
  });

  it('accounts every swap as two reads and two writes', () => {
    const counters = lastFrame(run([1, 2, 3, 4, 5, 6, 7], 'heapify; pop; push 0')).counters;
    expect(counters.writes).toBeGreaterThanOrEqual(counters.swaps * 2);
  });
});

describe('binary heap: frame hygiene', () => {
  it('holds every structural invariant with a changing length', () => {
    expectFrameHygiene(binaryHeap, runFrames(binaryHeap, {}), HYGIENE);
    expectFrameHygiene(binaryHeap, run([], 'push 5; push 3; pop; pop; pop'), HYGIENE);
  });

  it('is deterministic', () => {
    expectDeterministic(binaryHeap, { input: '4,8,2', ops: 'heapify; push 9; pop' });
  });

  it('honours its input contract', () => {
    expectInputContract(binaryHeap);
  });

  it('rejects unknown operations with a reason', () => {
    const result = binaryHeap.build({ input: '1,2', ops: 'peek' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/heapify.*push.*pop/i);
  });
});
