/**
 * Two pointers converging from both ends: find a pair summing to a target in a
 * sorted array, in O(n) instead of the O(n^2) double loop.
 */

import { arrayField, arrayPresets, parseNumberList } from '../../core/arrayInput';
import { defineAlgorithm, type ParamMap, type ParseResult } from '../../core/define';
import { ArrayScene } from '../../core/scene';
import type { ArrayRegion } from '../../core/types';

interface TwoPointersInput {
  readonly values: readonly number[];
  readonly target: number;
  readonly wasUnsorted: boolean;
}

const CODE = `function twoSum(a: number[], target: number): [number, number] | null {
  let l = 0;
  let r = a.length - 1;

  while (l < r) {
    const sum = a[l] + a[r];

    if (sum === target) return [l, r];   // found a pair
    if (sum < target) l++;               // too small: raise the low end
    else              r--;               // too big: lower the high end
  }

  return null;                           // no pair sums to target
}`;

const LINE = {
  enter: 1,
  initL: 2,
  initR: 3,
  loop: 5,
  sum: 6,
  checkEqual: 8,
  advanceL: 9,
  retreatR: 10,
  notFound: 12,
} as const;

function spanRegions(l: number, r: number, total: number): ArrayRegion[] {
  const regions: ArrayRegion[] = [];
  if (l > 0) regions.push({ from: 0, to: l - 1, label: 'ruled out', tone: 'excluded' });
  if (l <= r) regions.push({ from: l, to: r, label: `live range [${l}..${r}]`, tone: 'active' });
  if (r < total - 1) regions.push({ from: r + 1, to: total - 1, label: 'ruled out', tone: 'excluded' });
  return regions;
}

function parse(params: ParamMap): ParseResult<TwoPointersInput> {
  const parsed = parseNumberList(params.input ?? '', { label: 'Array', minLength: 2 });
  if (!parsed.ok) return parsed;

  const target = Number(params.target ?? '0');
  if (!Number.isFinite(target)) return { ok: false, error: 'Target must be a number.' };

  const wasUnsorted = parsed.value.some((value, index) => index > 0 && value < (parsed.value[index - 1] ?? value));
  const values = wasUnsorted ? [...parsed.value].sort((a, b) => a - b) : parsed.value;

  return { ok: true, value: { values, target, wasUnsorted } };
}

export const twoPointers = defineAlgorithm<TwoPointersInput>({
  meta: {
    id: 'two-pointers',
    name: 'Two pointers',
    category: 'arrays',
    structureKind: 'array',
    blurb: 'Walk a pair of indices inward to hit a target sum in O(n).',
    complexity: {
      time: { best: 'O(1)', average: 'O(n)', worst: 'O(n)' },
      space: 'O(1)',
      notes: [
        'Each step retires one index permanently, so the loop runs at most n - 1 times.',
        'Needs sorted input; if you have to sort first, the real cost is O(n log n).',
        'The unsorted version is a hash set in O(n) time and O(n) space - this one trades that space for the sort.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'reads'],
    inPlace: true,
  },
  fields: [
    { ...arrayField, defaultValue: '2, 7, 11, 15, 19, 24, 31, 38, 42, 55' },
    {
      key: 'target',
      label: 'Target sum',
      kind: 'number',
      defaultValue: '53',
      help: 'Pick a sum with no valid pair to watch the pointers cross.',
    },
  ],
  presets: arrayPresets.filter((preset) => preset.id === 'sorted' || preset.id === 'random'),
  sizeRange: { min: 4, max: 200, step: 1 },
  parse,
  *run(input) {
    const scene = new ArrayScene(input.values);
    const total = scene.length;
    const { target } = input;

    yield scene.frame({
      codeLine: LINE.enter,
      explanation: input.wasUnsorted
        ? `Looking for two values summing to ${target}. The input was sorted first, since the method depends on order.`
        : `Looking for two values summing to ${target} in ${total} sorted elements.`,
      regions: spanRegions(0, total - 1, total),
    });

    let l = 0;
    let r = total - 1;

    yield scene.frame({
      codeLine: LINE.initR,
      explanation: `Start at both ends: l = ${l}, r = ${r}.`,
      highlights: { active: [l, r] },
      pointers: { l, r },
      regions: spanRegions(l, r, total),
    });

    while (l < r) {
      const left = scene.read(l);
      const right = scene.read(r);
      const sum = left + right;

      scene.countComparison();
      if (sum === target) {
        yield scene.frame({
          codeLine: LINE.checkEqual,
          explanation: `a[${l}] + a[${r}] = ${left} + ${right} = ${target}. Found the pair after ${scene.counters().comparisons} comparisons.`,
          highlights: { sorted: [l, r] },
          pointers: { l, r },
          regions: spanRegions(l, r, total),
          includeSorted: false,
          phase: 'found',
        });
        return;
      }

      scene.countComparison();
      if (sum < target) {
        yield scene.frame({
          codeLine: LINE.advanceL,
          explanation: `${left} + ${right} = ${sum}, short of ${target}. a[${r}] is the biggest partner left, so a[${l}] can never reach ${target}: drop it.`,
          highlights: { comparing: [l, r] },
          pointers: { l, r },
          regions: spanRegions(l, r, total),
        });
        l += 1;
      } else {
        yield scene.frame({
          codeLine: LINE.retreatR,
          explanation: `${left} + ${right} = ${sum}, over ${target}. a[${l}] is the smallest partner left, so a[${r}] is too big for anything: drop it.`,
          highlights: { comparing: [l, r] },
          pointers: { l, r },
          regions: spanRegions(l, r, total),
        });
        r -= 1;
      }

      if (l < r) {
        yield scene.frame({
          codeLine: LINE.loop,
          explanation: `Range narrows to [${l}..${r}], ${r - l + 1} values still in play.`,
          highlights: { active: [l, r] },
          pointers: { l, r },
          regions: spanRegions(l, r, total),
        });
      }
    }

    yield scene.frame({
      codeLine: LINE.notFound,
      explanation: `The pointers met at ${l}, so every pair has been ruled out: no two values sum to ${target}.`,
      pointers: { l, r },
      phase: 'not found',
    });
  },
});
