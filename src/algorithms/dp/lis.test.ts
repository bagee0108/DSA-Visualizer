import { describe, expect, it } from 'vitest';

import { makeRng, randomInt } from '../../core/random';
import type { Frame } from '../../core/types';
import { expectDeterministic, expectFrameHygiene, expectInputContract, lastFrame, paneOf, runFrames, splitOf } from '../frameHygiene';
import { LINE, lis, MAX_LENGTH } from './lis';

function solve(values: readonly number[]): readonly Frame[] {
  return runFrames(lis, { input: values.join(', ') });
}

/** The chosen elements as indices, read back from the chip ids. */
function chosenOf(frames: readonly Frame[]): number[] {
  const strip = splitOf(lastFrame(frames)).strips.find((candidate) => candidate.label === 'lis');
  return (strip?.items ?? []).map((item) => Number(String(item.id).slice(1)));
}

function pileCount(frame: Frame | undefined): number {
  return paneOf(frame, 'piles').cells.filter((cell) => cell !== null).length;
}

/** Every subset, by brute force: a different formulation from either version. */
function reference(values: readonly number[]): number {
  let best = 0;
  for (let mask = 1; mask < 1 << values.length; mask++) {
    let last = -Infinity;
    let length = 0;
    let increasing = true;
    for (let at = 0; at < values.length && increasing; at++) {
      if ((mask & (1 << at)) === 0) continue;
      const value = values[at] ?? 0;
      if (value <= last) increasing = false;
      last = value;
      length += 1;
    }
    if (increasing) best = Math.max(best, length);
  }
  return best;
}

describe('lis: correctness', () => {
  it('solves the textbook case', () => {
    const values = [10, 9, 2, 5, 3, 7, 101, 18];
    const frames = solve(values);
    expect(pileCount(lastFrame(frames))).toBe(4);
    expect(chosenOf(frames).map((at) => values[at])).toEqual([2, 3, 7, 18]);
  });

  it('agrees with brute force, and the elements it picks really increase', () => {
    const rng = makeRng(20261014);
    for (let trial = 0; trial < 200; trial++) {
      const values = Array.from({ length: randomInt(rng, 1, MAX_LENGTH) }, () => randomInt(rng, -5, 15));
      const frames = solve(values);
      const chosen = chosenOf(frames);
      const label = values.join(',');
      expect(pileCount(lastFrame(frames)), label).toBe(reference(values));
      expect(chosen.length, label).toBe(reference(values));
      for (let at = 1; at < chosen.length; at++) {
        expect(chosen[at] ?? 0, label).toBeGreaterThan(chosen[at - 1] ?? 0);
        expect(values[chosen[at] ?? 0] ?? 0, label).toBeGreaterThan(values[chosen[at - 1] ?? 0] ?? 0);
      }
    }
  });

  it('handles sorted, reversed and all-equal input', () => {
    expect(pileCount(lastFrame(solve([1, 2, 3, 4, 5])))).toBe(5);
    expect(pileCount(lastFrame(solve([5, 4, 3, 2, 1])))).toBe(1);
    expect(pileCount(lastFrame(solve([7, 7, 7, 7])))).toBe(1);
  });

  it('lands every element on the pile numbered by its run length', () => {
    const values = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5];
    let i = 0;
    for (const frame of solve(values)) {
      if (frame.codeLine !== LINE.place) continue;
      const lit = (frame.highlights.active ?? []).map(String).find((ref) => ref.startsWith('piles/cell:0:'));
      const landed = Number(lit?.split(':')[2]);
      expect(paneOf(frame, 'piles').cells[landed], `a[${i}] is on the pile it says`).toBe(values[i]);
      expect(landed + 1, `a[${i}]`).toBe(paneOf(frame, 'table').cells[values.length + i]);
      i += 1;
    }
    expect(i).toBe(values.length);
  });

  it('keeps the pile tops strictly increasing', () => {
    for (const frame of solve([3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8])) {
      const tops = paneOf(frame, 'piles').cells.filter((cell): cell is number => cell !== null);
      for (let k = 1; k < tops.length; k++) expect(tops[k] ?? 0).toBeGreaterThan(tops[k - 1] ?? 0);
    }
  });
});

describe('lis: operation counts', () => {
  it('compares every pair in the table, and only log-many times per element in the piles', () => {
    for (const values of [[10, 9, 2, 5, 3, 7, 101, 18], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [5, 5, 5]]) {
      const { extra } = lastFrame(solve(values)).counters;
      const n = values.length;
      expect(extra['table comparisons']).toBe((n * (n - 1)) / 2);
      let bound = 0;
      for (let i = 1; i < n; i++) bound += Math.ceil(Math.log2(i + 1));
      expect(extra['pile comparisons'] ?? 0).toBeLessThanOrEqual(bound);
    }
  });
});

describe('lis: frame hygiene', () => {
  it('holds every structural invariant', () => {
    expectFrameHygiene(lis, solve([10, 9, 2, 5, 3, 7, 101, 18]));
  });

  it('holds them at the cap, at the value limits and on one element', () => {
    expectFrameHygiene(lis, solve([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]));
    expectFrameHygiene(lis, solve([-99, 999, -99, 999]));
    expectFrameHygiene(lis, solve([42]));
  });

  it('is deterministic', () => {
    expectDeterministic(lis, { input: '3, 1, 4, 1, 5, 9, 2, 6' });
  });

  it('honours its input contract', () => {
    expectInputContract(lis);
  });

  it('rejects bad input', () => {
    expect(lis.build({ input: '' }).ok).toBe(false);
    expect(lis.build({ input: '1, 2.5' }).ok).toBe(false);
    expect(lis.build({ input: '1, 1000' }).ok).toBe(false);
    expect(lis.build({ input: '1, -100' }).ok).toBe(false);
    expect(lis.build({ input: '1,2,3,4,5,6,7,8,9,10,11,12,13' }).ok).toBe(false);
  });

  it('runs every preset at every size', () => {
    for (const preset of lis.presets) {
      for (const size of [lis.sizeRange.min, 7, lis.sizeRange.max]) {
        const params = preset.build(size, makeRng(size));
        expect(lis.build(params).ok, `preset=${preset.id} size=${size}`).toBe(true);
      }
    }
  });
});
