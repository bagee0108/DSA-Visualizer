import { describe, expect, it } from 'vitest';

import { presetParams } from '../../core/arrayInput';
import { makeRng } from '../../core/random';
import type { Frame } from '../../core/types';
import {
  arrayOf,
  expectDeterministic,
  expectFrameHygiene,
  expectInputContract,
  lastFrame,
  runFrames,
  valuesOf,
} from '../frameHygiene';
import { heapsort } from './heapsort';

function sortedCopy(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

function isMaxHeap(values: readonly number[], size: number): boolean {
  for (let i = 0; i < size; i++) {
    const left = 2 * i + 1;
    const right = 2 * i + 2;
    const parent = values[i];
    if (parent === undefined) return false;
    if (left < size && (values[left] ?? -Infinity) > parent) return false;
    if (right < size && (values[right] ?? -Infinity) > parent) return false;
  }
  return true;
}

describe('heapsort: correctness', () => {
  const cases: ReadonlyArray<readonly [string, number[]]> = [
    ['single element', [5]],
    ['two elements', [2, 9]],
    ['already sorted', [1, 2, 3, 4, 5, 6, 7]],
    ['reversed', [7, 6, 5, 4, 3, 2, 1]],
    ['all equal', [3, 3, 3, 3, 3]],
    ['duplicates', [4, 1, 4, 2, 1, 3, 4]],
    ['negatives', [-5, 3, -1, 0, 8, -9]],
  ];

  for (const [name, values] of cases) {
    it(`sorts ${name}`, () => {
      expect(valuesOf(lastFrame(runFrames(heapsort, { input: values.join(',') })))).toEqual(
        sortedCopy(values),
      );
    });
  }

  it('sorts 120 random arrays', () => {
    const rng = makeRng(5150);
    for (let trial = 0; trial < 120; trial++) {
      const size = 1 + Math.floor(rng() * 30);
      const values = Array.from({ length: size }, () => Math.floor(rng() * 80) - 40);
      expect(valuesOf(lastFrame(runFrames(heapsort, { input: values.join(',') })))).toEqual(
        sortedCopy(values),
      );
    }
  });
});

describe('heapsort: the heap invariant', () => {
  const frames = runFrames(heapsort, { input: '17, 3, 42, 8, 25, 1, 36, 12, 9, 30' });

  it('has a valid max-heap once the build phase ends', () => {
    const lastBuild = frames.findLastIndex((frame: Frame) => frame.phase === 'build');
    expect(lastBuild).toBeGreaterThan(0);
    const frame = frames[lastBuild];
    if (frame === undefined) throw new Error('no build frame');
    expect(isMaxHeap(valuesOf(frame), arrayOf(frame).heap?.size ?? 0)).toBe(true);
  });

  it('restores the heap property every time a sift settles', () => {
    const SETTLED_LINE = 22;
    let checked = 0;
    for (const frame of frames) {
      if (frame.phase !== 'sort' || frame.codeLine !== SETTLED_LINE) continue;
      const size = arrayOf(frame).heap?.size ?? 0;
      expect(isMaxHeap(valuesOf(frame), size), `settled heap of size ${size}`).toBe(true);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(3);
  });

  it('shrinks the heap monotonically and ends with the tree hidden', () => {
    let previous = Infinity;
    for (const frame of frames) {
      const size = arrayOf(frame).heap?.size;
      if (size === undefined) continue;
      expect(size).toBeLessThanOrEqual(previous);
      previous = size;
    }
    expect(arrayOf(lastFrame(frames)).heap).toBeUndefined();
  });

  it('grows the sorted tail one slot at a time', () => {
    const tailSizes = frames
      .map((frame: Frame) => arrayOf(frame).heap?.size)
      .filter((size): size is number => size !== undefined);
    expect(tailSizes[0]).toBe(10);
    expect(Math.min(...tailSizes)).toBe(1);
  });
});

describe('heapsort: operation counts', () => {
  it('stays inside the 2n log n comparison bound', () => {
    for (const preset of ['random', 'sorted', 'reversed', 'few-unique', 'organpipe']) {
      const n = 64;
      const counters = lastFrame(runFrames(heapsort, presetParams(preset, n, 11))).counters;
      expect(counters.comparisons, `preset=${preset}`).toBeLessThanOrEqual(2 * n * Math.log2(n));
    }
  });

  it('builds the heap in linear comparisons', () => {
    const n = 64;
    const frames = runFrames(heapsort, presetParams('random', n, 17));
    const lastBuild = frames.findLastIndex((frame: Frame) => frame.phase === 'build');
    const buildComparisons = frames[lastBuild]?.counters.comparisons ?? 0;
    expect(buildComparisons).toBeLessThanOrEqual(2 * n);
  });

  it('sorts in place', () => {
    const counters = lastFrame(runFrames(heapsort, presetParams('random', 32, 1))).counters;
    expect(heapsort.meta.inPlace).toBe(true);
    expect(counters.writes).toBe(counters.swaps * 2);
  });
});

describe('heapsort: frame hygiene', () => {
  it('holds every structural invariant', () => {
    expectFrameHygiene(heapsort, runFrames(heapsort, presetParams('random', 24, 6)));
  });

  it('is deterministic', () => {
    expectDeterministic(heapsort, presetParams('random', 20, 2));
  });

  it('honours its input contract', () => {
    expectInputContract(heapsort);
  });
});
