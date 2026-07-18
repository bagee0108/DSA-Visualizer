/** Sliding window: the longest subarray whose sum stays within a limit. */

import { arrayField, parseNumberList, seedField } from '../../core/arrayInput';
import { defineAlgorithm, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
import { randomInt } from '../../core/random';
import { ArrayScene } from '../../core/scene';
import type { ArrayRegion } from '../../core/types';

interface SlidingWindowInput {
  readonly values: readonly number[];
  readonly limit: number;
}

const CODE = `function longestAtMost(a: number[], limit: number): number {
  let best = 0;
  let sum = 0;
  let left = 0;

  for (let right = 0; right < a.length; right++) {
    sum += a[right];                     // grow the window to the right

    while (sum > limit) {                // too heavy: shrink from the left
      sum -= a[left];
      left++;
    }

    best = Math.max(best, right - left + 1);
  }

  return best;                           // left never moves backwards
}`;

const LINE = {
  enter: 1,
  initBest: 2,
  initLeft: 4,
  loop: 6,
  grow: 7,
  checkHeavy: 9,
  shrink: 10,
  advanceLeft: 11,
  record: 15,
  ret: 18,
} as const;

function windowRegions(left: number, right: number, best: { from: number; to: number } | null): ArrayRegion[] {
  const regions: ArrayRegion[] = [];
  if (best !== null && best.to >= best.from) {
    regions.push({ from: best.from, to: best.to, label: `best so far (${best.to - best.from + 1})`, tone: 'sorted' });
  }
  if (right >= left) {
    regions.push({ from: left, to: right, label: `window [${left}..${right}]`, tone: 'active' });
  }
  return regions;
}

function windowIds(left: number, right: number): number[] {
  const ids: number[] = [];
  for (let index = left; index <= right; index++) ids.push(index);
  return ids;
}

const presets: readonly PresetSpec[] = [
  {
    id: 'random',
    label: 'Random',
    build: (size, rng) => {
      const values = Array.from({ length: size }, () => randomInt(rng, 1, 20));
      const limit = Math.max(20, Math.round((values.reduce((s, v) => s + v, 0) / size) * 5));
      return { input: values.join(', '), limit: String(limit), seed: String(randomInt(rng, 0, 999999)) };
    },
  },
  {
    id: 'spiky',
    label: 'Spiky',
    build: (size, rng) => {
      const values = Array.from({ length: size }, () => (rng() < 0.2 ? randomInt(rng, 30, 60) : randomInt(rng, 1, 6)));
      return { input: values.join(', '), limit: '40', seed: String(randomInt(rng, 0, 999999)) };
    },
  },
  {
    id: 'flat',
    label: 'All equal',
    build: (size) => ({ input: Array.from({ length: size }, () => 5).join(', '), limit: '32', seed: '0' }),
  },
];

function parse(params: ParamMap): ParseResult<SlidingWindowInput> {
  const parsed = parseNumberList(params.input ?? '', { label: 'Array' });
  if (!parsed.ok) return parsed;

  const negative = parsed.value.findIndex((value) => value < 0);
  if (negative >= 0) {
    return {
      ok: false,
      error: `Sliding window needs non-negative values (a[${negative}] = ${parsed.value[negative]}). With negatives, shrinking can make a rejected window valid again, so the monotone cursors are unsound.`,
    };
  }

  const limit = Number(params.limit ?? '0');
  if (!Number.isFinite(limit)) return { ok: false, error: 'Limit must be a number.' };
  if (limit < 0) return { ok: false, error: 'Limit must be non-negative.' };

  return { ok: true, value: { values: parsed.value, limit } };
}

export const slidingWindow = defineAlgorithm<SlidingWindowInput>({
  meta: {
    id: 'sliding-window',
    name: 'Sliding window',
    category: 'arrays',
    structureKind: 'array',
    blurb: 'Grow and shrink a window while maintaining a running invariant.',
    complexity: {
      time: { best: 'O(n)', average: 'O(n)', worst: 'O(n)' },
      space: 'O(1)',
      notes: [
        'The nested while loop is not nested work: left only ever moves forward, so both cursors together take 2n steps.',
        'Requires non-negative values. With negatives the window is no longer monotone and you need prefix sums plus a different structure.',
        'The same skeleton solves "at most k distinct" by swapping the sum for a frequency map.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'reads'],
    inPlace: true,
  },
  fields: [
    { ...arrayField, defaultValue: '4, 2, 9, 1, 3, 8, 2, 5, 6, 1, 7, 3' },
    {
      key: 'limit',
      label: 'Sum limit',
      kind: 'number',
      defaultValue: '15',
      help: 'The window may not exceed this total.',
    },
    seedField,
  ],
  presets,
  sizeRange: { min: 4, max: 200, step: 1 },
  parse,
  *run(input) {
    const scene = new ArrayScene(input.values);
    const total = scene.length;
    const { limit } = input;

    let best = 0;
    let bestSpan: { from: number; to: number } | null = null;
    let sum = 0;
    let left = 0;

    yield scene.frame({
      codeLine: LINE.enter,
      explanation: `Find the longest run of ${total} values whose sum stays at or below ${limit}.`,
    });

    for (let right = 0; right < total; right++) {
      const added = scene.read(right);
      sum += added;

      yield scene.frame({
        codeLine: LINE.grow,
        explanation: `Extend right to ${right}: add ${added}, window sum is ${sum}.`,
        highlights: { comparing: [right], active: windowIds(left, right - 1) },
        pointers: { left, right },
        regions: windowRegions(left, right, bestSpan),
      });

      scene.countComparison();
      while (sum > limit) {
        yield scene.frame({
          codeLine: LINE.checkHeavy,
          explanation: `${sum} exceeds the limit ${limit}, so the window has to shrink from the left.`,
          highlights: { excluded: [left], active: windowIds(left + 1, right) },
          pointers: { left, right },
          regions: windowRegions(left, right, bestSpan),
        });

        const removed = scene.read(left);
        sum -= removed;
        left += 1;

        yield scene.frame({
          codeLine: LINE.advanceLeft,
          explanation: `Drop a[${left - 1}] = ${removed}; sum falls to ${sum} and left advances to ${left}. left never goes back, which is why this stays linear.`,
          highlights: { active: windowIds(left, right) },
          pointers: { left, right },
          regions: windowRegions(left, right, bestSpan),
        });
        scene.countComparison();
      }

      const length = right - left + 1;
      scene.countComparison();
      if (length > best) {
        best = length;
        bestSpan = { from: left, to: right };
        yield scene.frame({
          codeLine: LINE.record,
          explanation: `Window [${left}..${right}] sums to ${sum} and spans ${length} - a new best.`,
          highlights: { sorted: windowIds(left, right) },
          pointers: { left, right },
          regions: windowRegions(left, right, bestSpan),
          includeSorted: false,
        });
      } else {
        yield scene.frame({
          codeLine: LINE.record,
          explanation: `Window [${left}..${right}] spans ${length}, which does not beat the best of ${best}.`,
          highlights: { active: windowIds(left, right) },
          pointers: { left, right },
          regions: windowRegions(left, right, bestSpan),
        });
      }
    }

    yield scene.frame({
      codeLine: LINE.ret,
      explanation:
        bestSpan === null
          ? `No single element fits under ${limit}, so the answer is 0.`
          : `Longest run within ${limit} is ${best} elements, a[${bestSpan.from}..${bestSpan.to}]. Both cursors together moved ${scene.counters().reads} times over ${total} elements.`,
      highlights: bestSpan === null ? {} : { sorted: windowIds(bestSpan.from, bestSpan.to) },
      regions: windowRegions(0, -1, bestSpan),
      includeSorted: false,
      phase: 'done',
    });
  },
});
