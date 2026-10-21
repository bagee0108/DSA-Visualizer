import { describe, expect, it } from 'vitest';

import '..';
import { presetParams } from '../../core/arrayInput';
import { isOpen, LEVELS, levelFor } from '../../core/levels';
import { makeRng } from '../../core/random';
import { sitemapPaths } from '../../seo/sitemap';
import { expectDeterministic, expectFrameHygiene, expectInputContract, lastFrame, runFrames, valuesOf } from '../frameHygiene';
import { insertionSort } from './insertionSort';

function sortedCopy(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

describe('insertion sort: correctness', () => {
  const cases: ReadonlyArray<readonly [string, number[]]> = [
    ['single element', [5]],
    ['two elements', [9, 2]],
    ['already sorted', [1, 2, 3, 4, 5, 6, 7]],
    ['reversed', [7, 6, 5, 4, 3, 2, 1]],
    ['all equal', [3, 3, 3, 3, 3]],
    ['duplicates', [4, 1, 4, 2, 1, 3, 4]],
    ['negatives', [-5, 3, -1, 0, 8, -9]],
  ];

  for (const [name, values] of cases) {
    it(`sorts ${name}`, () => {
      expect(valuesOf(lastFrame(runFrames(insertionSort, { input: values.join(',') })))).toEqual(sortedCopy(values));
    });
  }

  it('sorts 120 random arrays', () => {
    const rng = makeRng(808);
    for (let trial = 0; trial < 120; trial++) {
      const values = Array.from({ length: 1 + Math.floor(rng() * 30) }, () => Math.floor(rng() * 80) - 40);
      expect(valuesOf(lastFrame(runFrames(insertionSort, { input: values.join(',') })))).toEqual(sortedCopy(values));
    }
  });

  it('is stable: equal values keep their order, so it never moves one past an equal one', () => {
    // A value only slides past strictly larger ones; on all-equal input nothing slides.
    const counters = lastFrame(runFrames(insertionSort, { input: '3,3,3,3,3' })).counters;
    expect(counters.writes).toBe(4);
  });
});

describe('insertion sort: operation counts', () => {
  it('costs one comparison and one write per element on sorted input', () => {
    const counters = lastFrame(runFrames(insertionSort, presetParams('sorted', 100, 1))).counters;
    expect(counters.comparisons).toBe(99);
    expect(counters.writes).toBe(99);
  });

  it('costs every pair on reversed input', () => {
    const counters = lastFrame(runFrames(insertionSort, presetParams('reversed', 100, 1))).counters;
    expect(counters.comparisons).toBe((100 * 99) / 2);
  });
});

describe('insertion sort: frames', () => {
  it('holds every structural invariant on every preset', () => {
    for (const preset of ['random', 'sorted', 'reversed', 'nearly', 'few-unique', 'organpipe']) {
      expectFrameHygiene(insertionSort, runFrames(insertionSort, presetParams(preset, 24, 3)));
    }
  });

  it('keeps the worst case (100 reversed) to a frame per operation, plus two per element', () => {
    // One frame per comparison and per write, plus each key taken and each fall past the front.
    const frames = runFrames(insertionSort, presetParams('reversed', 100, 1));
    const { comparisons, writes } = lastFrame(frames).counters;
    expect(frames.length).toBeLessThanOrEqual(comparisons + writes + 2 * 100);
  });

  it('is deterministic', () => {
    expectDeterministic(insertionSort, presetParams('random', 30, 9));
  });

  it('honours its input contract', () => {
    expectInputContract(insertionSort);
  });
});

describe('insertion sort: the level', () => {
  it('is open, in the sorting run of the arrays lane, just before merge sort', () => {
    const level = levelFor('insertion-sort');
    expect(level).toBeDefined();
    if (level === undefined) return;
    expect(isOpen(level)).toBe(true);
    expect(level.lane).toBe('arrays');
    expect(level.ops).toEqual(['shift']);
    expect(LEVELS[level.number]?.id).toBe('mergesort');
    expect(sitemapPaths()).toContain('/visualize/insertion-sort');
  });

  it('offers the array presets, nearly sorted among them, and is close to linear on it', () => {
    expect(insertionSort.presets.map((preset) => preset.id)).toContain('nearly');
    const n = 100;
    const nearly = lastFrame(runFrames(insertionSort, presetParams('nearly', n, 5))).counters.comparisons;
    const random = lastFrame(runFrames(insertionSort, presetParams('random', n, 5))).counters.comparisons;
    expect(nearly).toBeLessThan(4 * n);
    expect(random).toBeGreaterThan(nearly * 5);
  });

  it('names its phase on every frame after the first, and ends like the other sorts', () => {
    const frames = runFrames(insertionSort, { input: '5, 2, 4, 1, 3' });
    expect(new Set(frames.slice(1, -1).map((frame) => frame.phase))).toEqual(new Set(['insert']));
    const last = lastFrame(frames);
    expect(last.phase).toBe('done');
    expect(last.step).toBeNull();
    expect(last.explanation).toMatch(/^Sorted\. \d+ comparisons and \d+ writes/);
  });

  it('stays inside the frame cap on the largest typed input, 200 reversed', () => {
    const frames = runFrames(insertionSort, presetParams('reversed', 200, 1));
    expect(frames.length).toBeLessThan(45000);
  });
});
