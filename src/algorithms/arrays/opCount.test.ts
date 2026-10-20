/**
 * Race mode clocks a run on operations: comparisons plus array writes. This
 * holds every sorting generator to the same definition, against reference
 * implementations written separately from the levels:
 *
 * - a comparison is one test of an element against an element or a value;
 * - a write is one store into an array slot, the main array or the aux row
 *   (so a swap is two writes and copying k values to aux is k).
 */

import { describe, expect, it } from 'vitest';

import { formatNumberList } from '../../core/arrayInput';
import type { ParamMap, RegisteredAlgorithm } from '../../core/define';
import { makeRng, randomInt, shuffle } from '../../core/random';
import { lastFrame, runFrames } from '../frameHygiene';
import { heapsort } from './heapsort';
import { insertionSort } from './insertionSort';
import { mergesort } from './mergesort';
import { quicksort } from './quicksort';

interface Ops {
  comparisons: number;
  writes: number;
}

type Strategy = 'last' | 'first' | 'middle' | 'median3' | 'random';

function quick(input: readonly number[], strategy: Strategy, seed: number): Ops {
  const a = [...input];
  const ops: Ops = { comparisons: 0, writes: 0 };
  const rng = makeRng(seed);
  const swap = (i: number, j: number): void => {
    const t = a[i] as number;
    a[i] = a[j] as number;
    a[j] = t;
    ops.writes += 2;
  };
  const less = (x: number, y: number): boolean => {
    ops.comparisons += 1;
    return x < y;
  };
  const partition = (lo: number, hi: number): number => {
    const mid = lo + ((hi - lo) >> 1);
    if (strategy === 'median3' && hi - lo >= 2) {
      if (less(a[mid] as number, a[lo] as number)) swap(mid, lo);
      if (less(a[hi] as number, a[lo] as number)) swap(hi, lo);
      if (less(a[hi] as number, a[mid] as number)) swap(hi, mid);
      swap(mid, hi);
    } else {
      const chosen = strategy === 'first' ? lo : strategy === 'middle' ? mid : strategy === 'random' ? randomInt(rng, lo, hi) : hi;
      if (chosen !== hi) swap(chosen, hi);
    }
    const pivot = a[hi] as number;
    let i = lo;
    for (let j = lo; j < hi; j++) {
      if (less(a[j] as number, pivot)) {
        swap(i, j);
        i += 1;
      }
    }
    swap(i, hi);
    return i;
  };
  const sort = (lo: number, hi: number): void => {
    if (lo >= hi) return;
    const p = partition(lo, hi);
    sort(lo, p - 1);
    sort(p + 1, hi);
  };
  sort(0, a.length - 1);
  return ops;
}

function merge(input: readonly number[]): Ops {
  const a = [...input];
  const aux = [...input];
  const ops: Ops = { comparisons: 0, writes: 0 };
  const sort = (lo: number, hi: number): void => {
    if (lo >= hi) return;
    const mid = (lo + hi) >> 1;
    sort(lo, mid);
    sort(mid + 1, hi);
    for (let k = lo; k <= hi; k++) aux[k] = a[k] as number;
    ops.writes += hi - lo + 1;
    let i = lo;
    let j = mid + 1;
    for (let k = lo; k <= hi; k++) {
      let left: boolean;
      if (i > mid) left = false;
      else if (j > hi) left = true;
      else {
        ops.comparisons += 1;
        left = (aux[j] as number) >= (aux[i] as number);
      }
      a[k] = left ? (aux[i++] as number) : (aux[j++] as number);
      ops.writes += 1;
    }
  };
  sort(0, a.length - 1);
  return ops;
}

function heap(input: readonly number[]): Ops {
  const a = [...input];
  const ops: Ops = { comparisons: 0, writes: 0 };
  const swap = (i: number, j: number): void => {
    const t = a[i] as number;
    a[i] = a[j] as number;
    a[j] = t;
    ops.writes += 2;
  };
  const sift = (start: number, size: number): void => {
    let i = start;
    for (;;) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let largest = i;
      if (l < size) {
        ops.comparisons += 1;
        if ((a[l] as number) > (a[largest] as number)) largest = l;
      }
      if (r < size) {
        ops.comparisons += 1;
        if ((a[r] as number) > (a[largest] as number)) largest = r;
      }
      if (largest === i) return;
      swap(i, largest);
      i = largest;
    }
  };
  const n = a.length;
  for (let i = (n >> 1) - 1; i >= 0; i--) sift(i, n);
  for (let end = n - 1; end > 0; end--) {
    swap(0, end);
    sift(0, end);
  }
  return ops;
}

function insertion(input: readonly number[]): Ops {
  const a = [...input];
  const ops: Ops = { comparisons: 0, writes: 0 };
  for (let i = 1; i < a.length; i++) {
    const key = a[i] as number;
    let j = i - 1;
    while (j >= 0) {
      ops.comparisons += 1;
      if ((a[j] as number) <= key) break;
      a[j + 1] = a[j] as number;
      ops.writes += 1;
      j -= 1;
    }
    a[j + 1] = key;
    ops.writes += 1;
  }
  return ops;
}

function inputs(): { readonly name: string; readonly values: number[] }[] {
  const out: { name: string; values: number[] }[] = [];
  for (const n of [1, 2, 3, 7, 16, 33, 60]) {
    const ramp = Array.from({ length: n }, (_, i) => i + 1);
    out.push({ name: `sorted ${n}`, values: ramp });
    out.push({ name: `reversed ${n}`, values: [...ramp].reverse() });
    for (const seed of [1, 2, 3]) {
      const rng = makeRng(seed * 97 + n);
      out.push({ name: `random ${n}#${seed}`, values: shuffle([...ramp], rng) });
      out.push({ name: `few unique ${n}#${seed}`, values: ramp.map(() => randomInt(rng, 1, 4)) });
    }
  }
  return out;
}

function counted(algorithm: RegisteredAlgorithm, params: ParamMap): Ops {
  const { counters } = lastFrame(runFrames(algorithm, params));
  return { comparisons: counters.comparisons, writes: counters.writes };
}

describe('operation counts: comparisons and writes, one definition for every sort', () => {
  it('quicksort matches the reference with every pivot strategy', () => {
    for (const { name, values } of inputs()) {
      for (const pivot of ['last', 'first', 'middle', 'median3', 'random'] as const) {
        expect(counted(quicksort, { input: formatNumberList(values), pivot, seed: '1337' }), `${name} ${pivot}`).toEqual(quick(values, pivot, 1337));
      }
    }
  });

  it('merge sort matches the reference, aux copies counted as writes', () => {
    for (const { name, values } of inputs()) expect(counted(mergesort, { input: formatNumberList(values) }), name).toEqual(merge(values));
  });

  it('heapsort matches the reference', () => {
    for (const { name, values } of inputs()) expect(counted(heapsort, { input: formatNumberList(values) }), name).toEqual(heap(values));
  });

  it('insertion sort matches the reference', () => {
    for (const { name, values } of inputs()) expect(counted(insertionSort, { input: formatNumberList(values) }), name).toEqual(insertion(values));
  });

  it('never counts backwards: comparisons plus writes rise or hold from frame to frame', () => {
    for (const algorithm of [quicksort, mergesort, heapsort, insertionSort]) {
      for (const { name, values } of inputs()) {
        let previous = 0;
        for (const frame of runFrames(algorithm, { input: formatNumberList(values) })) {
          const ops = frame.counters.comparisons + frame.counters.writes;
          expect(ops, `${algorithm.meta.id} ${name}`).toBeGreaterThanOrEqual(previous);
          previous = ops;
        }
      }
    }
  });

  it('shows the race lesson: insertion sort on sorted input is linear, quicksort with the last element as pivot is quadratic', () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(insertion(sorted)).toEqual({ comparisons: 99, writes: 99 });
    expect(quick(sorted, 'last', 1).comparisons).toBe((100 * 99) / 2);
  });
});
