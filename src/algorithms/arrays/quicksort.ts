/** Quicksort with Lomuto partitioning. */

import { arrayField, arrayPresets, parseNumberList, seedField } from '../../core/arrayInput';
import { defineAlgorithm, type ParamMap, type ParseResult } from '../../core/define';
import { makeRng, randomInt } from '../../core/random';
import { ArrayScene } from '../../core/scene';
import type { ArrayRegion, Frame } from '../../core/types';

const PIVOT_STRATEGIES = ['last', 'first', 'middle', 'median3', 'random'] as const;
type PivotStrategy = (typeof PIVOT_STRATEGIES)[number];

const STRATEGY_LABEL: Record<PivotStrategy, string> = {
  last: 'last element',
  first: 'first element',
  middle: 'middle element',
  median3: 'median of three',
  random: 'random element',
};

interface QuicksortInput {
  readonly values: readonly number[];
  readonly strategy: PivotStrategy;
  readonly seed: number;
}

const CODE = `function quicksort(a: number[], lo = 0, hi = a.length - 1): void {
  if (lo >= hi) return;               // 0 or 1 elements: nothing to do

  const p = partition(a, lo, hi);     // pivot lands on its final index p

  quicksort(a, lo, p - 1);            // everything left of p is smaller
  quicksort(a, p + 1, hi);            // everything right of p is larger
}

function partition(a: number[], lo: number, hi: number): number {
  choosePivot(a, lo, hi);             // swap the chosen pivot to a[hi]
  const pivot = a[hi];
  let i = lo;                         // a[lo..i-1] holds values < pivot

  for (let j = lo; j < hi; j++) {
    if (a[j] < pivot) {               // a[j] belongs in the left region
      swap(a, i, j);
      i++;
    }
  }

  swap(a, i, hi);                     // pivot into its final slot
  return i;
}`;

const LINE = {
  enter: 1,
  baseCase: 2,
  callPartition: 4,
  recurseLeft: 6,
  recurseRight: 7,
  returnFromCall: 8,
  enterPartition: 10,
  choosePivot: 11,
  readPivot: 12,
  initI: 13,
  loop: 15,
  compare: 16,
  swap: 17,
  advanceI: 18,
  placePivot: 22,
  returnP: 23,
} as const;

interface Context {
  readonly scene: ArrayScene;
  readonly strategy: PivotStrategy;
  readonly rng: () => number;
}

function partitionRegions(lo: number, hi: number, i: number, j: number): ArrayRegion[] {
  const regions: ArrayRegion[] = [];
  if (i > lo) regions.push({ from: lo, to: i - 1, label: '< pivot', tone: 'left' });
  if (j > i) regions.push({ from: i, to: j - 1, label: '>= pivot', tone: 'right' });
  if (j <= hi - 1) regions.push({ from: j, to: hi - 1, label: 'unexamined', tone: 'excluded' });
  return regions;
}

function subarrayRegion(lo: number, hi: number): ArrayRegion[] {
  return [{ from: lo, to: hi, label: `subarray [${lo}..${hi}]`, tone: 'active' }];
}

function rangeIds(lo: number, hi: number): number[] {
  const ids: number[] = [];
  for (let index = lo; index <= hi; index++) ids.push(index);
  return ids;
}

function* choosePivot(ctx: Context, lo: number, hi: number): Generator<Frame, void, undefined> {
  const { scene, strategy } = ctx;
  const mid = lo + ((hi - lo) >> 1);

  if (strategy === 'median3' && hi - lo >= 2) {
    if (scene.compare(mid, lo) < 0) scene.swap(mid, lo);
    if (scene.compare(hi, lo) < 0) scene.swap(hi, lo);
    if (scene.compare(hi, mid) < 0) scene.swap(hi, mid);
    scene.swap(mid, hi);
    yield scene.frame({
      codeLine: LINE.choosePivot,
      explanation: `Median of a[${lo}], a[${mid}], a[${hi}] is ${scene.peek(hi)} - moved to the end to act as the pivot.`,
      highlights: { pivot: [hi], comparing: [lo, mid] },
      pointers: { lo, hi },
      regions: subarrayRegion(lo, hi),
      phase: 'partition',
    });
    return;
  }

  let chosen = hi;
  if (strategy === 'first') chosen = lo;
  else if (strategy === 'middle') chosen = mid;
  else if (strategy === 'random') chosen = randomInt(ctx.rng, lo, hi);

  if (chosen !== hi) {
    const value = scene.peek(chosen);
    scene.swap(chosen, hi);
    yield scene.frame({
      codeLine: LINE.choosePivot,
      explanation: `Pivot strategy "${STRATEGY_LABEL[strategy]}" picked a[${chosen}] = ${value}; swap it to the end so the loop can scan a[${lo}..${hi - 1}].`,
      highlights: { pivot: [hi], swapped: [chosen, hi] },
      pointers: { lo, hi },
      regions: subarrayRegion(lo, hi),
      phase: 'partition',
    });
  }
}

function* partition(ctx: Context, lo: number, hi: number): Generator<Frame, number, undefined> {
  const { scene } = ctx;
  scene.bump('partitions');
  scene.pushCall({ label: `partition(${lo}, ${hi})`, codeLine: LINE.enterPartition });

  yield scene.frame({
    codeLine: LINE.enterPartition,
    explanation: `Partition a[${lo}..${hi}] (${hi - lo + 1} elements).`,
    pointers: { lo, hi },
    regions: subarrayRegion(lo, hi),
    phase: 'partition',
  });

  yield* choosePivot(ctx, lo, hi);

  const pivot = scene.read(hi);
  yield scene.frame({
    codeLine: LINE.readPivot,
    explanation: `pivot = a[${hi}] = ${pivot}. Everything smaller ends up left of it, everything else right.`,
    highlights: { pivot: [hi] },
    pointers: { lo, hi },
    regions: subarrayRegion(lo, hi),
    phase: 'partition',
  });

  let i = lo;
  yield scene.frame({
    codeLine: LINE.initI,
    explanation: `i = ${i}. The region a[${lo}..i-1] is empty for now and will hold every value below ${pivot}.`,
    highlights: { pivot: [hi] },
    pointers: { lo, hi, i },
    regions: partitionRegions(lo, hi, i, lo),
    phase: 'partition',
  });

  for (let j = lo; j < hi; j++) {
    const value = scene.peek(j);
    const isLess = scene.compareValue(j, pivot) < 0;

    yield scene.frame({
      codeLine: LINE.compare,
      explanation: isLess
        ? `a[${j}] = ${value} < pivot ${pivot} - it belongs in the left region.`
        : `a[${j}] = ${value} >= pivot ${pivot} - leave it in place, the right region grows by one.`,
      highlights: { comparing: [j], pivot: [hi] },
      pointers: { lo, hi, i, j },
      regions: partitionRegions(lo, hi, i, j),
      phase: 'partition',
    });

    if (isLess) {
      const displaced = scene.peek(i);
      scene.swap(i, j);
      yield scene.frame({
        codeLine: LINE.swap,
        explanation:
          i === j
            ? `i === j === ${i}, so swap(a, i, j) is a no-op: ${value} is already at the boundary.`
            : `Swap ${value} into the left region at ${i}, pushing ${displaced} out to ${j}.`,
        highlights: { swapped: [i, j], pivot: [hi] },
        pointers: { lo, hi, i, j },
        regions: partitionRegions(lo, hi, i, j),
        phase: 'partition',
      });

      i += 1;
      yield scene.frame({
        codeLine: LINE.advanceI,
        explanation: `i advances to ${i}: a[${lo}..${i - 1}] now holds ${i - lo} value(s) below the pivot.`,
        highlights: { pivot: [hi] },
        pointers: { lo, hi, i, j },
        regions: partitionRegions(lo, hi, i, j + 1),
        phase: 'partition',
      });
    }
  }

  yield scene.frame({
    codeLine: LINE.loop,
    explanation: `Scan done: a[${lo}..${i - 1}] < ${pivot} <= a[${i}..${hi - 1}]. Slot ${i} is where the pivot belongs.`,
    highlights: { pivot: [hi], candidate: [i] },
    pointers: { lo, hi, i },
    regions: partitionRegions(lo, hi, i, hi),
    phase: 'partition',
  });

  scene.swap(i, hi);
  scene.markSorted(i);
  yield scene.frame({
    codeLine: LINE.placePivot,
    explanation: `Swap the pivot ${pivot} into slot ${i}. It is in its final position now and will never move again.`,
    highlights: { swapped: [i, hi] },
    pointers: { lo, hi, i },
    regions: subarrayRegion(lo, hi),
    phase: 'partition',
  });

  scene.popCall();
  yield scene.frame({
    codeLine: LINE.returnP,
    explanation: `Return p = ${i}. Quicksort recurses on a[${lo}..${i - 1}] and a[${i + 1}..${hi}].`,
    pointers: { lo, hi, p: i },
    regions: subarrayRegion(lo, hi),
    phase: 'partition',
  });

  return i;
}

function* sort(ctx: Context, lo: number, hi: number): Generator<Frame, void, undefined> {
  const { scene } = ctx;
  scene.countCall();
  scene.pushCall({
    label: `quicksort(${lo}, ${hi})`,
    codeLine: LINE.enter,
    detail: `${Math.max(0, hi - lo + 1)} elements`,
  });

  if (lo > hi) {
    yield scene.frame({
      codeLine: LINE.baseCase,
      explanation: `quicksort(${lo}, ${hi}): empty range, return immediately.`,
      pointers: { lo, hi },
      phase: 'recursion',
    });
    scene.popCall();
    return;
  }

  yield scene.frame({
    codeLine: LINE.enter,
    explanation: `quicksort(${lo}, ${hi}) on ${hi - lo + 1} element(s), depth ${scene.depth}.`,
    highlights: { active: rangeIds(lo, hi) },
    pointers: { lo, hi },
    regions: subarrayRegion(lo, hi),
    phase: 'recursion',
  });

  if (lo === hi) {
    scene.markSorted(lo);
    yield scene.frame({
      codeLine: LINE.baseCase,
      explanation: `Base case: one element is already sorted, so a[${lo}] = ${scene.peek(lo)} is final.`,
      pointers: { lo, hi },
      phase: 'recursion',
    });
    scene.popCall();
    return;
  }

  yield scene.frame({
    codeLine: LINE.callPartition,
    explanation: `Call partition(a, ${lo}, ${hi}) to place one pivot correctly.`,
    highlights: { active: rangeIds(lo, hi) },
    pointers: { lo, hi },
    regions: subarrayRegion(lo, hi),
    phase: 'recursion',
  });

  const p = yield* partition(ctx, lo, hi);

  yield scene.frame({
    codeLine: LINE.recurseLeft,
    explanation: `Recurse left: quicksort(a, ${lo}, ${p - 1}).`,
    pointers: { lo, hi, p },
    regions: p - 1 >= lo ? subarrayRegion(lo, p - 1) : [],
    phase: 'recursion',
  });
  yield* sort(ctx, lo, p - 1);

  yield scene.frame({
    codeLine: LINE.recurseRight,
    explanation: `Recurse right: quicksort(a, ${p + 1}, ${hi}).`,
    pointers: { lo, hi, p },
    regions: p + 1 <= hi ? subarrayRegion(p + 1, hi) : [],
    phase: 'recursion',
  });
  yield* sort(ctx, p + 1, hi);

  scene.popCall();
  yield scene.frame({
    codeLine: LINE.returnFromCall,
    explanation: `a[${lo}..${hi}] is fully sorted; return to depth ${scene.depth}.`,
    highlights: { active: rangeIds(lo, hi) },
    pointers: { lo, hi },
    phase: 'recursion',
  });
}

function parse(params: ParamMap): ParseResult<QuicksortInput> {
  const parsed = parseNumberList(params.input ?? '', { label: 'Array' });
  if (!parsed.ok) return parsed;

  const rawStrategy = params.pivot ?? 'last';
  const strategy = PIVOT_STRATEGIES.find((candidate) => candidate === rawStrategy);
  if (strategy === undefined) {
    return { ok: false, error: `Unknown pivot strategy "${rawStrategy}".` };
  }

  const seed = Number(params.seed ?? '0');
  if (!Number.isFinite(seed)) return { ok: false, error: 'Seed must be a number.' };

  return { ok: true, value: { values: parsed.value, strategy, seed } };
}

export const quicksort = defineAlgorithm<QuicksortInput>({
  meta: {
    id: 'quicksort',
    name: 'Quicksort',
    category: 'sorting',
    structureKind: 'array',
    blurb: 'Lomuto partition around a pivot, then recurse into both halves.',
    complexity: {
      time: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n^2)' },
      space: 'O(log n)',
      notes: [
        'Worst case is a sorted array with a first/last pivot: every partition peels off one element.',
        'Space is the recursion stack; the partition itself is in place.',
        'Run the Sorted preset with the last-element pivot to watch the quadratic blow-up.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'swaps', 'accesses', 'recursiveCalls'],
    stable: false,
    inPlace: true,
  },
  fields: [
    arrayField,
    {
      key: 'pivot',
      label: 'Pivot',
      kind: 'select',
      defaultValue: 'last',
      options: PIVOT_STRATEGIES.map((value) => ({ value, label: STRATEGY_LABEL[value] })),
      help: 'Pivot choice is what separates O(n log n) from O(n^2).',
    },
    seedField,
  ],
  presets: arrayPresets,
  sizeRange: { min: 4, max: 200, step: 1 },
  parse,
  *run(input) {
    const scene = new ArrayScene(input.values);
    const ctx: Context = { scene, strategy: input.strategy, rng: makeRng(input.seed) };

    yield scene.frame({
      codeLine: LINE.enter,
      explanation: `Quicksort ${input.values.length} elements. Lomuto partition, pivot = ${STRATEGY_LABEL[input.strategy]}.`,
      pointers: { lo: 0, hi: input.values.length - 1 },
    });

    yield* sort(ctx, 0, input.values.length - 1);

    scene.markSortedRange(0, input.values.length - 1);
    const counters = scene.counters();
    yield scene.frame({
      codeLine: 0,
      explanation: `Sorted. ${counters.comparisons} comparisons, ${counters.swaps} swaps, ${counters.recursiveCalls} calls.`,
      phase: 'done',
    });
  },
});
