import { describe, expect, it } from 'vitest';

import { presetParams } from '../../core/arrayInput';
import type { ParamMap } from '../../core/define';
import { makeRng, shuffle } from '../../core/random';
import type { ArraySnapshot, Frame } from '../../core/types';
import { quicksort } from './quicksort';

function run(params: ParamMap): readonly Frame[] {
  const result = quicksort.build(params);
  if (!result.ok) throw new Error(`build failed: ${result.error}`);
  return result.frames;
}

function valuesOf(frame: Frame): number[] {
  const structure: ArraySnapshot = frame.structure;
  return structure.elements.map((element) => element.value);
}

function lastFrame(frames: readonly Frame[]): Frame {
  const frame = frames[frames.length - 1];
  if (frame === undefined) throw new Error('no frames');
  return frame;
}

function paramsFor(values: readonly number[], pivot = 'last'): ParamMap {
  return { input: values.join(','), pivot, seed: '1337' };
}

function referenceQuicksort(input: readonly number[]): {
  sorted: number[];
  comparisons: number;
  swaps: number;
  calls: number;
} {
  const a = [...input];
  let comparisons = 0;
  let swaps = 0;
  let calls = 0;

  const swap = (i: number, j: number): void => {
    swaps += 1;
    const x = a[i];
    const y = a[j];
    if (x === undefined || y === undefined) return;
    a[i] = y;
    a[j] = x;
  };

  const partition = (lo: number, hi: number): number => {
    const pivot = a[hi];
    if (pivot === undefined) return lo;
    let i = lo;
    for (let j = lo; j < hi; j++) {
      comparisons += 1;
      const value = a[j];
      if (value !== undefined && value < pivot) {
        swap(i, j);
        i += 1;
      }
    }
    swap(i, hi);
    return i;
  };

  const sort = (lo: number, hi: number): void => {
    calls += 1;
    if (lo >= hi) return;
    const p = partition(lo, hi);
    sort(lo, p - 1);
    sort(p + 1, hi);
  };

  sort(0, a.length - 1);
  return { sorted: a, comparisons, swaps, calls };
}

const CODE_LINE_COUNT = quicksort.codeLines.length;

describe('quicksort: correctness', () => {
  const cases: ReadonlyArray<readonly [string, number[]]> = [
    ['single element', [42]],
    ['two elements ascending', [1, 2]],
    ['two elements descending', [2, 1]],
    ['already sorted', [1, 2, 3, 4, 5, 6, 7, 8]],
    ['reversed', [8, 7, 6, 5, 4, 3, 2, 1]],
    ['all equal', [5, 5, 5, 5, 5, 5]],
    ['duplicates', [3, 1, 3, 1, 2, 2, 3, 1]],
    ['negatives and zero', [0, -4, 7, -1, 3, -9, 0]],
    ['floats', [1.5, -2.25, 0.5, 1.25, -2.5]],
  ];

  for (const [name, values] of cases) {
    it(`sorts ${name}`, () => {
      const frames = run(paramsFor(values));
      const expected = [...values].sort((x, y) => x - y);
      expect(valuesOf(lastFrame(frames))).toEqual(expected);
    });
  }

  it('sorts 200 random arrays against Array.prototype.sort', () => {
    const rng = makeRng(20250911);
    for (let trial = 0; trial < 200; trial++) {
      const size = 1 + Math.floor(rng() * 40);
      const values = Array.from({ length: size }, () => Math.floor(rng() * 100) - 50);
      const frames = run(paramsFor(values));
      expect(valuesOf(lastFrame(frames))).toEqual([...values].sort((x, y) => x - y));
    }
  });

  it('sorts under every pivot strategy', () => {
    const values = shuffle(
      Array.from({ length: 64 }, (_, index) => index + 1),
      makeRng(7),
    );
    const expected = [...values].sort((x, y) => x - y);
    for (const pivot of ['last', 'first', 'middle', 'median3', 'random']) {
      const frames = run(paramsFor(values, pivot));
      expect(valuesOf(lastFrame(frames)), `pivot=${pivot}`).toEqual(expected);
    }
  });

  it('handles n=200, the documented smoothness target', () => {
    const frames = run({ ...presetParams('random', 200, 99), pivot: 'median3' });
    const sorted = valuesOf(lastFrame(frames));
    expect(sorted).toHaveLength(200);
    expect(sorted).toEqual([...sorted].sort((x, y) => x - y));
  });

  it('keeps element ids a permutation of the originals in every frame', () => {
    const frames = run(paramsFor([9, 4, 7, 1, 8, 3, 6, 2, 5]));
    for (const frame of frames) {
      const ids = frame.structure.elements.map((element) => element.id).sort((x, y) => x - y);
      expect(ids).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    }
  });
});

describe('quicksort: operation counts', () => {
  it('matches a reference implementation exactly', () => {
    const rng = makeRng(4242);
    for (let trial = 0; trial < 50; trial++) {
      const size = 1 + Math.floor(rng() * 30);
      const values = Array.from({ length: size }, () => Math.floor(rng() * 50));
      const frames = run(paramsFor(values));
      const reference = referenceQuicksort(values);
      const counters = lastFrame(frames).counters;

      expect(counters.comparisons).toBe(reference.comparisons);
      expect(counters.swaps).toBe(reference.swaps);
      expect(counters.recursiveCalls).toBe(reference.calls);
    }
  });

  it('hits the textbook quadratic worst case on sorted input', () => {
    const n = 60;
    const values = Array.from({ length: n }, (_, index) => index + 1);
    const counters = lastFrame(run(paramsFor(values, 'last'))).counters;

    expect(counters.comparisons).toBe((n * (n - 1)) / 2);
    expect(counters.swaps).toBe((n * (n + 1)) / 2 - 1);
    expect(counters.recursiveCalls).toBe(1 + 2 * (n - 1));
  });

  it('median-of-three avoids the quadratic blow-up on sorted input', () => {
    const n = 60;
    const values = Array.from({ length: n }, (_, index) => index + 1);
    const naive = lastFrame(run(paramsFor(values, 'last'))).counters.comparisons;
    const median = lastFrame(run(paramsFor(values, 'median3'))).counters.comparisons;

    expect(median).toBeLessThan(naive / 4);
    expect(median).toBeLessThan(12 * n);
  });

  it('never decreases a counter from one frame to the next', () => {
    const frames = run(presetParams('random', 40, 3));
    for (let index = 1; index < frames.length; index++) {
      const previous = frames[index - 1];
      const current = frames[index];
      if (previous === undefined || current === undefined) throw new Error('missing frame');
      expect(current.counters.comparisons).toBeGreaterThanOrEqual(previous.counters.comparisons);
      expect(current.counters.swaps).toBeGreaterThanOrEqual(previous.counters.swaps);
      expect(current.counters.reads).toBeGreaterThanOrEqual(previous.counters.reads);
      expect(current.counters.writes).toBeGreaterThanOrEqual(previous.counters.writes);
      expect(current.counters.recursiveCalls).toBeGreaterThanOrEqual(previous.counters.recursiveCalls);
    }
  });

  it('accounts every swap as two reads and two writes', () => {
    const frames = run(presetParams('random', 32, 11));
    const counters = lastFrame(frames).counters;
    expect(counters.writes).toBe(counters.swaps * 2);
    expect(counters.reads).toBeGreaterThanOrEqual(counters.swaps * 2 + counters.comparisons);
  });
});

describe('quicksort: frame hygiene', () => {
  const frames = run(presetParams('random', 24, 5));

  it('produces a sane number of frames', () => {
    const counters = lastFrame(frames).counters;
    const work = counters.comparisons + counters.swaps + counters.recursiveCalls;
    expect(frames.length).toBeGreaterThan(24);
    expect(frames.length).toBeLessThan(6 * work + 32);
  });

  it('points every frame at a real source line', () => {
    for (const frame of frames) {
      expect(frame.codeLine).toBeGreaterThanOrEqual(0);
      expect(frame.codeLine).toBeLessThanOrEqual(CODE_LINE_COUNT);
    }
  });

  it('gives every frame a non-empty explanation', () => {
    for (const frame of frames) {
      expect(frame.explanation.trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps pointers and highlights inside the array', () => {
    const size = frames[0]?.structure.elements.length ?? 0;
    for (const frame of frames) {
      for (const value of Object.values(frame.pointers)) {
        expect(value).toBeGreaterThanOrEqual(-1);
        expect(value).toBeLessThanOrEqual(size);
      }
      for (const ids of Object.values(frame.highlights)) {
        for (const id of ids ?? []) {
          expect(typeof id === 'number' ? id : -1).toBeGreaterThanOrEqual(0);
          expect(typeof id === 'number' ? id : 0).toBeLessThan(size);
        }
      }
    }
  });

  it('keeps regions inside the array and non-empty', () => {
    const size = frames[0]?.structure.elements.length ?? 0;
    for (const frame of frames) {
      for (const region of frame.structure.regions) {
        expect(region.from).toBeGreaterThanOrEqual(0);
        expect(region.to).toBeLessThan(size);
        expect(region.from).toBeLessThanOrEqual(region.to);
      }
    }
  });

  it('balances the call stack and ends empty', () => {
    for (const frame of frames) {
      expect(frame.callStack.length).toBeLessThan(64);
    }
    expect(lastFrame(frames).callStack).toHaveLength(0);
  });

  it('marks every index sorted in the final frame', () => {
    const size = lastFrame(frames).structure.elements.length;
    expect(lastFrame(frames).highlights.sorted ?? []).toHaveLength(size);
  });

  it('never mutates a frame that was already yielded', () => {
    const first = frames[0];
    if (first === undefined) throw new Error('no frames');
    expect(valuesOf(first)).not.toEqual(valuesOf(lastFrame(frames)));
    expect(Object.isFrozen(first.structure.elements)).toBe(true);
  });

  it('is deterministic for identical params', () => {
    const params = presetParams('random', 30, 777);
    const a = run(params);
    const b = run(params);
    expect(a.length).toBe(b.length);
    expect(a.map(valuesOf)).toEqual(b.map(valuesOf));
    expect(a.map((frame) => frame.explanation)).toEqual(b.map((frame) => frame.explanation));
  });

  it('is deterministic for the random pivot strategy given a seed', () => {
    const params = { ...paramsFor([5, 2, 9, 1, 7, 3, 8, 4, 6], 'random'), seed: '2024' };
    expect(run(params).length).toBe(run(params).length);
    expect(run({ ...params, seed: '1' }).map(valuesOf)).not.toEqual(run(params).map(valuesOf));
  });
});

describe('quicksort: input parsing', () => {
  it('accepts commas, spaces and newlines', () => {
    const expected = [1, 2, 3];
    for (const text of ['3,2,1', '3 2 1', '3\n2\n1', ' 3 , 2 ,1 ']) {
      expect(valuesOf(lastFrame(run({ input: text })))).toEqual(expected);
    }
  });

  it('falls back to defaults for missing params', () => {
    const result = quicksort.build({});
    expect(result.ok).toBe(true);
  });

  it('reports bad input instead of throwing', () => {
    const cases: ReadonlyArray<readonly [ParamMap, RegExp]> = [
      [{ input: '1, abc, 3' }, /not a number/i],
      [{ input: '   ' }, /at least/i],
      [{ input: Array.from({ length: 201 }, (_, i) => i).join(',') }, /capped at 200/i],
      [{ input: '1,2,3', pivot: 'nonsense' }, /unknown pivot/i],
    ];

    for (const [params, pattern] of cases) {
      const result = quicksort.build(params);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(pattern);
    }
  });

  it('exposes defaults for every declared field', () => {
    for (const field of quicksort.fields) {
      expect(quicksort.defaults[field.key]).toBe(field.defaultValue);
    }
  });

  it('builds a runnable input from every preset', () => {
    for (const preset of quicksort.presets) {
      const params = preset.build(24, makeRng(1));
      const result = quicksort.build(params);
      expect(result.ok, `preset=${preset.id}`).toBe(true);
    }
  });
});
