/** Binary search over a sorted array. */

import { arrayField, arrayPresets, parseNumberList } from '../../core/arrayInput';
import { defineAlgorithm, type ParamMap, type ParseResult } from '../../core/define';
import { ArrayScene } from '../../core/scene';
import type { ArrayRegion } from '../../core/types';

interface BinarySearchInput {
  readonly values: readonly number[];
  readonly target: number;
  readonly wasUnsorted: boolean;
}

const CODE = `function binarySearch(a: number[], target: number): number {
  let lo = 0;
  let hi = a.length - 1;

  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);   // lo + hi could overflow; this cannot

    if (a[mid] === target) return mid;   // found it
    if (a[mid] < target) lo = mid + 1;   // target must be in the right half
    else                 hi = mid - 1;   // target must be in the left half
  }

  return -1;                             // not present
}`;

const LINE = {
  enter: 1,
  initLo: 2,
  initHi: 3,
  loop: 5,
  mid: 6,
  checkEqual: 8,
  goRight: 9,
  goLeft: 10,
  notFound: 13,
} as const;

function windowRegions(lo: number, hi: number, total: number): ArrayRegion[] {
  const regions: ArrayRegion[] = [];
  if (lo > 0) regions.push({ from: 0, to: lo - 1, label: 'discarded', tone: 'excluded' });
  if (lo <= hi) regions.push({ from: lo, to: hi, label: `search window [${lo}..${hi}]`, tone: 'active' });
  if (hi < total - 1) regions.push({ from: hi + 1, to: total - 1, label: 'discarded', tone: 'excluded' });
  return regions;
}

function outside(lo: number, hi: number, total: number): number[] {
  const ids: number[] = [];
  for (let index = 0; index < total; index++) {
    if (index < lo || index > hi) ids.push(index);
  }
  return ids;
}

function parse(params: ParamMap): ParseResult<BinarySearchInput> {
  const parsed = parseNumberList(params.input ?? '', { label: 'Array' });
  if (!parsed.ok) return parsed;

  const target = Number(params.target ?? '0');
  if (!Number.isFinite(target)) return { ok: false, error: 'Target must be a number.' };

  const wasUnsorted = parsed.value.some((value, index) => index > 0 && value < (parsed.value[index - 1] ?? value));
  const values = wasUnsorted ? [...parsed.value].sort((a, b) => a - b) : parsed.value;

  return { ok: true, value: { values, target, wasUnsorted } };
}

export const binarySearch = defineAlgorithm<BinarySearchInput>({
  meta: {
    id: 'binary-search',
    name: 'Binary search',
    category: 'searching',
    structureKind: 'array',
    blurb: 'Halve the search interval until the target is pinned down.',
    complexity: {
      time: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
      space: 'O(1)',
      notes: [
        'A miss costs the same as a hit: floor(log2 n) + 1 iterations either way.',
        'mid = lo + ((hi - lo) >> 1) instead of (lo + hi) >> 1 avoids overflow on large bounds.',
        'The lower-bound variant (first index not less than target) is the one you actually want most of the time.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'reads'],
    inPlace: true,
  },
  fields: [
    { ...arrayField, defaultValue: '3, 8, 12, 19, 24, 31, 45, 52, 66, 70, 88, 91' },
    {
      key: 'target',
      label: 'Target',
      kind: 'number',
      defaultValue: '45',
      help: 'Try a value that is not in the array to watch the window collapse.',
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
        ? `Searching for ${target}. The input was not sorted, so it has been sorted first - binary search is meaningless otherwise.`
        : `Searching ${total} sorted elements for ${target}.`,
      regions: windowRegions(0, total - 1, total),
    });

    let lo = 0;
    let hi = total - 1;

    yield scene.frame({
      codeLine: LINE.initHi,
      explanation: `The window starts as the whole array: lo = ${lo}, hi = ${hi}.`,
      pointers: { lo, hi },
      regions: windowRegions(lo, hi, total),
    });

    while (lo <= hi) {
      const mid = lo + ((hi - lo) >> 1);
      const value = scene.peek(mid);

      yield scene.frame({
        codeLine: LINE.mid,
        explanation: `Window [${lo}..${hi}] holds ${hi - lo + 1} candidates; probe the middle, a[${mid}] = ${value}.`,
        highlights: { candidate: [mid], excluded: outside(lo, hi, total) },
        pointers: { lo, mid, hi },
        regions: windowRegions(lo, hi, total),
      });

      if (scene.compareValue(mid, target) === 0) {
        yield scene.frame({
          codeLine: LINE.checkEqual,
          explanation: `a[${mid}] = ${value} is the target. Found at index ${mid} after ${scene.counters().comparisons} comparisons.`,
          highlights: { sorted: [mid], excluded: outside(lo, hi, total) },
          pointers: { mid },
          regions: windowRegions(lo, hi, total),
          includeSorted: false,
          phase: 'found',
        });
        return;
      }

      if (scene.compareValue(mid, target) < 0) {
        const discarded = mid - lo + 1;
        lo = mid + 1;
        yield scene.frame({
          codeLine: LINE.goRight,
          explanation: `${value} < ${target}, so everything up to index ${mid} is too small. lo becomes ${lo}, discarding ${discarded} slots at once.`,
          highlights: { excluded: outside(lo, hi, total) },
          pointers: { lo, hi },
          regions: windowRegions(lo, hi, total),
        });
      } else {
        hi = mid - 1;
        yield scene.frame({
          codeLine: LINE.goLeft,
          explanation: `${value} > ${target}, so everything from index ${mid} up is too big. hi becomes ${hi}.`,
          highlights: { excluded: outside(lo, hi, total) },
          pointers: { lo, hi },
          regions: windowRegions(lo, hi, total),
        });
      }
    }

    yield scene.frame({
      codeLine: LINE.notFound,
      explanation: `lo = ${lo} passed hi = ${hi}, so the window is empty: ${target} is not in the array. Note lo is where it would be inserted.`,
      highlights: { excluded: outside(0, -1, total) },
      pointers: { lo, hi },
      phase: 'not found',
    });
  },
});
