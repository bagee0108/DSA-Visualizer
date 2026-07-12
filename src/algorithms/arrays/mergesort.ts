/** Top-down merge sort. */

import { arrayField, arrayPresets, parseNumberList } from '../../core/arrayInput';
import { defineAlgorithm, type ParamMap, type ParseResult } from '../../core/define';
import { ArrayScene } from '../../core/scene';
import type { ArrayRegion, Frame } from '../../core/types';

interface MergesortInput {
  readonly values: readonly number[];
}

const CODE = `function mergesort(a: number[], lo = 0, hi = a.length - 1): void {
  if (lo >= hi) return;                     // one element is already sorted

  const mid = (lo + hi) >> 1;
  mergesort(a, lo, mid);                    // sort the left half
  mergesort(a, mid + 1, hi);                // sort the right half
  merge(a, lo, mid, hi);                    // fuse the two sorted runs
}

function merge(a: number[], lo: number, mid: number, hi: number): void {
  for (let k = lo; k <= hi; k++) aux[k] = a[k];   // snapshot the range

  let i = lo;                               // cursor into the left run
  let j = mid + 1;                          // cursor into the right run

  for (let k = lo; k <= hi; k++) {
    if (i > mid)              a[k] = aux[j++];    // left run exhausted
    else if (j > hi)          a[k] = aux[i++];    // right run exhausted
    else if (aux[j] < aux[i]) a[k] = aux[j++];    // strictly less keeps it stable
    else                      a[k] = aux[i++];
  }
}`;

const LINE = {
  enter: 1,
  baseCase: 2,
  mid: 4,
  recurseLeft: 5,
  recurseRight: 6,
  callMerge: 7,
  enterMerge: 11,
  copy: 12,
  initI: 14,
  initJ: 15,
  loop: 17,
  takeRightExhaustedLeft: 18,
  takeLeftExhaustedRight: 19,
  takeRight: 20,
  takeLeft: 21,
} as const;

function halves(lo: number, mid: number, hi: number): ArrayRegion[] {
  return [
    { from: lo, to: mid, label: `left [${lo}..${mid}]`, tone: 'left' },
    { from: mid + 1, to: hi, label: `right [${mid + 1}..${hi}]`, tone: 'right' },
  ];
}

function* merge(
  scene: ArrayScene,
  lo: number,
  mid: number,
  hi: number,
): Generator<Frame, void, undefined> {
  scene.bump('merges');
  scene.pushCall({ label: `merge(${lo}, ${mid}, ${hi})`, codeLine: LINE.enterMerge });

  yield scene.frame({
    codeLine: LINE.enterMerge,
    explanation: `Merge the sorted runs a[${lo}..${mid}] and a[${mid + 1}..${hi}].`,
    pointers: { lo, mid, hi },
    regions: halves(lo, mid, hi),
    phase: 'merge',
  });

  scene.copyToAux('aux', lo, hi);
  yield scene.frame({
    codeLine: LINE.copy,
    explanation: `Copy a[${lo}..${hi}] into aux. The merge reads from aux and writes back into a.`,
    pointers: { lo, hi },
    regions: halves(lo, mid, hi),
    phase: 'merge',
  });

  let i = lo;
  let j = mid + 1;

  yield scene.frame({
    codeLine: LINE.initJ,
    explanation: `i = ${i} walks the left run, j = ${j} walks the right run. Each step takes the smaller head.`,
    highlights: { comparing: [`aux:${i}`, `aux:${j}`] },
    pointers: { lo, hi },
    auxPointers: { i, j },
    regions: halves(lo, mid, hi),
    phase: 'merge',
  });

  for (let k = lo; k <= hi; k++) {
    let takeLeft: boolean;
    let reason: string;

    if (i > mid) {
      takeLeft = false;
      reason = `the left run is used up, so the rest of the right run comes over in order`;
      yield scene.frame({
        codeLine: LINE.takeRightExhaustedLeft,
        explanation: `i passed mid: ${reason}. Take aux[${j}] = ${scene.auxPeek(j)}.`,
        highlights: { comparing: [`aux:${j}`], active: [k] },
        pointers: { k },
        auxPointers: { j },
        regions: halves(lo, mid, hi),
        phase: 'merge',
      });
    } else if (j > hi) {
      takeLeft = true;
      reason = `the right run is used up`;
      yield scene.frame({
        codeLine: LINE.takeLeftExhaustedRight,
        explanation: `j passed hi: ${reason}. Take aux[${i}] = ${scene.auxPeek(i)}.`,
        highlights: { comparing: [`aux:${i}`], active: [k] },
        pointers: { k },
        auxPointers: { i },
        regions: halves(lo, mid, hi),
        phase: 'merge',
      });
    } else {
      const left = scene.auxPeek(i);
      const right = scene.auxPeek(j);
      takeLeft = scene.compareAux(j, i) >= 0;
      reason = takeLeft
        ? `${left} <= ${right}`
        : `${right} < ${left}`;
      yield scene.frame({
        codeLine: takeLeft ? LINE.takeLeft : LINE.takeRight,
        explanation: takeLeft
          ? `${reason}, so the left head wins${left === right ? ' (tie goes left, which is what keeps merge sort stable)' : ''}. Write ${left} to a[${k}].`
          : `${reason}, so the right head wins. Write ${right} to a[${k}].`,
        highlights: { comparing: [`aux:${i}`, `aux:${j}`], active: [k] },
        pointers: { k },
        auxPointers: { i, j },
        regions: halves(lo, mid, hi),
        phase: 'merge',
      });
    }

    const source = takeLeft ? i : j;
    const value = scene.auxPeek(source);
    scene.moveFromAux(k, source);
    if (takeLeft) i += 1;
    else j += 1;

    yield scene.frame({
      codeLine: takeLeft ? LINE.takeLeft : LINE.takeRight,
      explanation: `a[${k}] = ${value}. ${takeLeft ? `i` : `j`} advances to ${takeLeft ? i : j}.`,
      highlights: { swapped: [k] },
      pointers: { k },
      auxPointers: takeLeft ? { i } : { j },
      regions: halves(lo, mid, hi),
      phase: 'merge',
    });
  }

  scene.clearAux();
  scene.popCall();
  yield scene.frame({
    codeLine: LINE.loop,
    explanation: `a[${lo}..${hi}] is one sorted run of ${hi - lo + 1} elements now.`,
    highlights: { sorted: rangeIds(lo, hi) },
    regions: [{ from: lo, to: hi, label: `sorted [${lo}..${hi}]`, tone: 'sorted' }],
    includeSorted: false,
    phase: 'merge',
  });
}

function rangeIds(lo: number, hi: number): number[] {
  const ids: number[] = [];
  for (let index = lo; index <= hi; index++) ids.push(index);
  return ids;
}

function* sort(scene: ArrayScene, lo: number, hi: number): Generator<Frame, void, undefined> {
  scene.countCall();
  scene.pushCall({
    label: `mergesort(${lo}, ${hi})`,
    codeLine: LINE.enter,
    detail: `${Math.max(0, hi - lo + 1)} elements`,
  });

  if (lo >= hi) {
    yield scene.frame({
      codeLine: LINE.baseCase,
      explanation:
        lo === hi
          ? `Base case: a[${lo}] = ${scene.peek(lo)} is a sorted run of one.`
          : `Empty range, return.`,
      pointers: { lo, hi },
      phase: 'split',
    });
    scene.popCall();
    return;
  }

  const mid = (lo + hi) >> 1;
  yield scene.frame({
    codeLine: LINE.mid,
    explanation: `Split a[${lo}..${hi}] at mid = ${mid} into ${mid - lo + 1} and ${hi - mid} elements.`,
    highlights: { active: rangeIds(lo, hi) },
    pointers: { lo, mid, hi },
    regions: halves(lo, mid, hi),
    phase: 'split',
  });

  yield scene.frame({
    codeLine: LINE.recurseLeft,
    explanation: `Sort the left half a[${lo}..${mid}] first.`,
    pointers: { lo, mid },
    regions: [{ from: lo, to: mid, label: `left [${lo}..${mid}]`, tone: 'left' }],
    phase: 'split',
  });
  yield* sort(scene, lo, mid);

  yield scene.frame({
    codeLine: LINE.recurseRight,
    explanation: `Now sort the right half a[${mid + 1}..${hi}].`,
    pointers: { mid, hi },
    regions: [{ from: mid + 1, to: hi, label: `right [${mid + 1}..${hi}]`, tone: 'right' }],
    phase: 'split',
  });
  yield* sort(scene, mid + 1, hi);

  yield* merge(scene, lo, mid, hi);
  scene.popCall();
}

function parse(params: ParamMap): ParseResult<MergesortInput> {
  const parsed = parseNumberList(params.input ?? '', { label: 'Array' });
  if (!parsed.ok) return parsed;
  return { ok: true, value: { values: parsed.value } };
}

export const mergesort = defineAlgorithm<MergesortInput>({
  meta: {
    id: 'mergesort',
    name: 'Merge sort',
    category: 'sorting',
    structureKind: 'array',
    blurb: 'Split to single elements, then merge sorted runs back together.',
    complexity: {
      time: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)' },
      space: 'O(n)',
      notes: [
        'The only O(n log n) guarantee in this phase: no input shape degrades it.',
        'Space is the auxiliary buffer, which is why it loses to quicksort in practice despite the better worst case.',
        'Stable, because a tie in the merge always takes from the left run.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'reads', 'writes', 'recursiveCalls'],
    stable: true,
    inPlace: false,
  },
  fields: [arrayField],
  presets: arrayPresets,
  sizeRange: { min: 4, max: 200, step: 1 },
  parse,
  *run(input) {
    const scene = new ArrayScene(input.values);

    yield scene.frame({
      codeLine: LINE.enter,
      explanation: `Merge sort ${input.values.length} elements. Split down to runs of one, then merge upward.`,
      pointers: { lo: 0, hi: input.values.length - 1 },
    });

    yield* sort(scene, 0, input.values.length - 1);

    scene.markSortedRange(0, input.values.length - 1);
    const counters = scene.counters();
    yield scene.frame({
      codeLine: 0,
      explanation: `Sorted. ${counters.comparisons} comparisons, ${counters.writes} writes, ${counters.extra.merges ?? 0} merges.`,
      phase: 'done',
    });
  },
});
