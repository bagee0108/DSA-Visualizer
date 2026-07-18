/** Kadane's algorithm: maximum subarray sum in one pass. */

import { arrayField, parseNumberList, seedField } from '../../core/arrayInput';
import { defineAlgorithm, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
import { randomInt } from '../../core/random';
import { ArrayScene } from '../../core/scene';
import type { ArrayRegion } from '../../core/types';

interface KadaneInput {
  readonly values: readonly number[];
}

const CODE = `function kadane(a: number[]): { sum: number; from: number; to: number } {
  let best = a[0];                       // best sum found anywhere
  let current = a[0];                    // best sum of a run ending at i
  let start = 0;                         // where that run began
  let bestFrom = 0;
  let bestTo = 0;

  for (let i = 1; i < a.length; i++) {
    if (current + a[i] >= a[i]) {        // equivalently: current >= 0
      current = current + a[i];          // extending still pays
    } else {
      current = a[i];                    // the prefix was dead weight
      start = i;
    }

    if (current > best) {                // new global maximum
      best = current;
      bestFrom = start;
      bestTo = i;
    }
  }

  return { sum: best, from: bestFrom, to: bestTo };
}`;

const LINE = {
  enter: 1,
  initBest: 2,
  initCurrent: 3,
  loop: 8,
  test: 9,
  extend: 10,
  restart: 12,
  moveStart: 13,
  testBest: 17,
  updateBest: 18,
  ret: 24,
} as const;

function bands(
  start: number,
  i: number,
  bestFrom: number,
  bestTo: number,
  hasBest: boolean,
): ArrayRegion[] {
  const regions: ArrayRegion[] = [];
  if (hasBest && bestTo >= bestFrom) {
    regions.push({ from: bestFrom, to: bestTo, label: 'best run', tone: 'sorted' });
  }
  if (i >= start) {
    regions.push({ from: start, to: i, label: 'current run', tone: 'active' });
  }
  return regions;
}

function span(from: number, to: number): number[] {
  const ids: number[] = [];
  for (let index = from; index <= to; index++) ids.push(index);
  return ids;
}

const presets: readonly PresetSpec[] = [
  {
    id: 'mixed',
    label: 'Mixed signs',
    build: (size, rng) => ({
      input: Array.from({ length: size }, () => randomInt(rng, -9, 9)).join(', '),
      seed: String(randomInt(rng, 0, 999999)),
    }),
  },
  {
    id: 'all-negative',
    label: 'All negative',
    build: (size, rng) => ({
      input: Array.from({ length: size }, () => randomInt(rng, -20, -1)).join(', '),
      seed: String(randomInt(rng, 0, 999999)),
    }),
  },
  {
    id: 'one-spike',
    label: 'Buried spike',
    build: (size, rng) => {
      const values = Array.from({ length: size }, () => randomInt(rng, -8, 3));
      const at = randomInt(rng, 1, Math.max(1, size - 2));
      values[at] = randomInt(rng, 30, 60);
      return { input: values.join(', '), seed: String(randomInt(rng, 0, 999999)) };
    },
  },
  {
    id: 'all-positive',
    label: 'All positive',
    build: (size, rng) => ({
      input: Array.from({ length: size }, () => randomInt(rng, 1, 12)).join(', '),
      seed: '0',
    }),
  },
];

function parse(params: ParamMap): ParseResult<KadaneInput> {
  const parsed = parseNumberList(params.input ?? '', { label: 'Array' });
  if (!parsed.ok) return parsed;
  return { ok: true, value: { values: parsed.value } };
}

export const kadane = defineAlgorithm<KadaneInput>({
  meta: {
    id: 'kadane',
    name: "Kadane's algorithm",
    category: 'dynamic-programming',
    structureKind: 'array',
    blurb: 'Maximum subarray sum in one pass, restarting when the run goes negative.',
    complexity: {
      time: { best: 'O(n)', average: 'O(n)', worst: 'O(n)' },
      space: 'O(1)',
      notes: [
        'A one-dimensional DP with the table collapsed to a single variable: best[i] depends only on best[i-1].',
        'Try the all-negative preset. Initialising best to 0 instead of a[0] silently returns 0 and is the classic bug.',
        'The divide and conquer version is O(n log n); prefix sums with a running minimum is another O(n) route.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'reads'],
    inPlace: true,
  },
  fields: [
    { ...arrayField, defaultValue: '-2, 1, -3, 4, -1, 2, 1, -5, 4' },
    seedField,
  ],
  presets,
  sizeRange: { min: 4, max: 200, step: 1 },
  parse,
  *run(input) {
    const scene = new ArrayScene(input.values);
    const total = scene.length;

    const first = scene.read(0);
    let best = first;
    let current = first;
    let start = 0;
    let bestFrom = 0;
    let bestTo = 0;

    yield scene.frame({
      codeLine: LINE.initCurrent,
      explanation: `Seed both sums with a[0] = ${first}. Starting best at 0 instead would break on an all-negative array.`,
      highlights: { active: [0] },
      pointers: { i: 0 },
      regions: bands(0, 0, 0, 0, true),
    });

    for (let i = 1; i < total; i++) {
      const value = scene.read(i);
      const extended = current + value;

      scene.countComparison();
      if (extended >= value) {
        current = extended;
        yield scene.frame({
          codeLine: LINE.extend,
          explanation: `Run sum ${current - value} is not negative, so extending beats restarting: ${current - value} + ${value} = ${current}.`,
          highlights: { comparing: [i], active: span(start, i - 1) },
          pointers: { i, start },
          regions: bands(start, i, bestFrom, bestTo, true),
        });
      } else {
        current = value;
        start = i;
        yield scene.frame({
          codeLine: LINE.restart,
          explanation: `The run so far sums to ${extended - value}, which only drags a[${i}] = ${value} down. Abandon it and restart the run at ${i}.`,
          highlights: { swapped: [i], excluded: span(Math.max(0, i - 3), i - 1) },
          pointers: { i, start },
          regions: bands(start, i, bestFrom, bestTo, true),
        });
      }

      scene.countComparison();
      if (current > best) {
        best = current;
        bestFrom = start;
        bestTo = i;
        yield scene.frame({
          codeLine: LINE.updateBest,
          explanation: `${current} beats the old best: a[${bestFrom}..${bestTo}] is the new champion.`,
          highlights: { sorted: span(bestFrom, bestTo) },
          pointers: { i, start },
          regions: bands(start, i, bestFrom, bestTo, true),
          includeSorted: false,
        });
      } else {
        yield scene.frame({
          codeLine: LINE.testBest,
          explanation: `Current run sums to ${current}, short of the best ${best} at a[${bestFrom}..${bestTo}].`,
          highlights: { active: span(start, i) },
          pointers: { i, start },
          regions: bands(start, i, bestFrom, bestTo, true),
        });
      }
    }

    yield scene.frame({
      codeLine: LINE.ret,
      explanation: `Maximum subarray sum is ${best}, from a[${bestFrom}] to a[${bestTo}], found in one pass over ${total} elements.`,
      highlights: { sorted: span(bestFrom, bestTo) },
      regions: [{ from: bestFrom, to: bestTo, label: `max sum ${best}`, tone: 'sorted' }],
      includeSorted: false,
      phase: 'done',
    });
  },
});
