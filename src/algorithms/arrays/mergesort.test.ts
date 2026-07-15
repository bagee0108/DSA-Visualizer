import { describe, expect, it } from 'vitest';

import { presetParams } from '../../core/arrayInput';
import { makeRng } from '../../core/random';
import type { Frame } from '../../core/types';
import {
  expectDeterministic,
  expectFrameHygiene,
  expectInputContract,
  idsOf,
  lastFrame,
  runFrames,
  valuesOf,
} from '../frameHygiene';
import { mergesort } from './mergesort';

function sortedCopy(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

describe('mergesort: correctness', () => {
  const cases: ReadonlyArray<readonly [string, number[]]> = [
    ['single element', [7]],
    ['two elements', [2, 1]],
    ['already sorted', [1, 2, 3, 4, 5]],
    ['reversed', [9, 8, 7, 6, 5, 4, 3, 2, 1]],
    ['all equal', [4, 4, 4, 4]],
    ['odd length with duplicates', [5, 1, 5, 2, 5, 3, 1]],
    ['negatives', [3, -7, 0, -2, 8, -1]],
  ];

  for (const [name, values] of cases) {
    it(`sorts ${name}`, () => {
      expect(valuesOf(lastFrame(runFrames(mergesort, { input: values.join(',') })))).toEqual(
        sortedCopy(values),
      );
    });
  }

  it('sorts 150 random arrays', () => {
    const rng = makeRng(31337);
    for (let trial = 0; trial < 150; trial++) {
      const size = 1 + Math.floor(rng() * 36);
      const values = Array.from({ length: size }, () => Math.floor(rng() * 60) - 20);
      expect(valuesOf(lastFrame(runFrames(mergesort, { input: values.join(',') })))).toEqual(
        sortedCopy(values),
      );
    }
  });

  it('handles n=200', () => {
    const sorted = valuesOf(lastFrame(runFrames(mergesort, presetParams('random', 200, 5))));
    expect(sorted).toHaveLength(200);
    expect(sorted).toEqual(sortedCopy(sorted));
  });
});

describe('mergesort: stability', () => {
  it('preserves the original order of equal values', () => {
    const rng = makeRng(909);
    for (let trial = 0; trial < 40; trial++) {
      const size = 2 + Math.floor(rng() * 30);
      const values = Array.from({ length: size }, () => Math.floor(rng() * 4));
      const final = lastFrame(runFrames(mergesort, { input: values.join(',') }));
      const finalValues = valuesOf(final);
      const finalIds = idsOf(final);

      for (let i = 1; i < finalValues.length; i++) {
        if (finalValues[i] === finalValues[i - 1]) {
          expect(finalIds[i], `tie at ${i} must keep original order`).toBeGreaterThan(
            finalIds[i - 1] ?? -1,
          );
        }
      }
    }
  });
});

describe('mergesort: operation counts', () => {
  it('stays inside the n log n comparison bound on every input shape', () => {
    for (const preset of ['random', 'sorted', 'reversed', 'few-unique', 'organpipe']) {
      const params = presetParams(preset, 64, 3);
      const counters = lastFrame(runFrames(mergesort, params)).counters;
      expect(counters.comparisons, `preset=${preset}`).toBeLessThanOrEqual(64 * 6);
      expect(counters.comparisons, `preset=${preset}`).toBeGreaterThan(0);
    }
  });

  it('writes every element back once per merge level', () => {
    const n = 32;
    const counters = lastFrame(runFrames(mergesort, presetParams('random', n, 2))).counters;
    expect(counters.writes).toBe(2 * n * Math.log2(n));
  });

  it('is not in place, and says so', () => {
    expect(mergesort.meta.inPlace).toBe(false);
    expect(mergesort.meta.stable).toBe(true);
  });
});

describe('mergesort: the auxiliary view', () => {
  const frames = runFrames(mergesort, { input: '5, 3, 8, 1, 9, 2' });

  it('shows the aux buffer during merges and hides it otherwise', () => {
    const withAux = frames.filter((frame: Frame) => frame.structure.auxiliary !== undefined);
    expect(withAux.length).toBeGreaterThan(0);
    expect(withAux.length).toBeLessThan(frames.length);
    expect(lastFrame(frames).structure.auxiliary).toBeUndefined();
  });

  it('keeps the aux window inside the range being merged', () => {
    for (const frame of frames) {
      const aux = frame.structure.auxiliary;
      if (aux === undefined) continue;
      expect(aux.activeFrom).toBeLessThanOrEqual(aux.activeTo);
      for (const [label, index] of Object.entries(aux.pointers)) {
        expect(index, `aux pointer ${label}`).toBeGreaterThanOrEqual(0);
        expect(index, `aux pointer ${label}`).toBeLessThanOrEqual(frames.length);
      }
    }
  });

  it('addresses aux slots with the aux: prefix', () => {
    const auxHighlights = frames.flatMap((frame) =>
      Object.values(frame.highlights).flatMap((ids) => (ids ?? []).filter((id) => typeof id === 'string')),
    );
    expect(auxHighlights.length).toBeGreaterThan(0);
    for (const id of auxHighlights) expect(id).toMatch(/^aux:\d+$/);
  });
});

describe('mergesort: frame hygiene', () => {
  it('holds every structural invariant', () => {
    expectFrameHygiene(mergesort, runFrames(mergesort, presetParams('random', 24, 8)));
  });

  it('is deterministic', () => {
    expectDeterministic(mergesort, presetParams('random', 20, 4));
  });

  it('honours its input contract', () => {
    expectInputContract(mergesort);
  });

  it('reports bad input instead of throwing', () => {
    expect(mergesort.build({ input: 'x, y' }).ok).toBe(false);
    expect(mergesort.build({ input: '   ' }).ok).toBe(false);
  });
});
