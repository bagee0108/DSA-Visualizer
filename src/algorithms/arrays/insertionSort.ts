/**
 * Insertion sort, the shifting version: take the next value out, slide every
 * larger value one place right, drop it into the gap. Used by race mode (it is
 * not a level of its own): on sorted input it makes one comparison per element,
 * which is the point of racing it against quicksort.
 */

import { arrayField, arrayPresets, parseNumberList } from '../../core/arrayInput';
import { defineAlgorithm, type ParamMap, type ParseResult } from '../../core/define';
import { ArrayScene } from '../../core/scene';
import type { ArrayRegion } from '../../core/types';

interface InsertionInput {
  readonly values: readonly number[];
}

const CODE = `function insertionSort(a: number[]): void {
  for (let i = 1; i < a.length; i++) {
    const key = a[i];                      // the next value to place
    let j = i - 1;
    while (j >= 0 && a[j] > key) {         // larger values slide right
      a[j + 1] = a[j];
      j--;
    }
    a[j + 1] = key;                        // into the gap they left
  }
}`;

const LINE = {
  enter: 1,
  loop: 2,
  key: 3,
  test: 5,
  shift: 6,
  place: 9,
} as const;

function sortedPrefix(i: number): ArrayRegion[] {
  return i > 0 ? [{ from: 0, to: i - 1, label: 'sorted prefix', tone: 'sorted' }] : [];
}

function parse(params: ParamMap): ParseResult<InsertionInput> {
  const parsed = parseNumberList(params.input ?? '', { label: 'Array' });
  if (!parsed.ok) return parsed;
  return { ok: true, value: { values: parsed.value } };
}

export const insertionSort = defineAlgorithm<InsertionInput>({
  meta: {
    id: 'insertion-sort',
    name: 'Insertion sort',
    category: 'sorting',
    structureKind: 'array',
    blurb: 'Grow a sorted prefix by sliding each new value back to its place.',
    complexity: {
      time: { best: 'O(n)', average: 'O(n^2)', worst: 'O(n^2)' },
      space: 'O(1)',
      notes: [
        'Each value slides past exactly the larger values before it, so the work is the number of inversions plus n.',
        'Sorted input costs one comparison per element; reversed input costs every pair.',
        'Stable and in place, and the fastest choice on short or nearly sorted arrays.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'writes'],
    stable: true,
    inPlace: true,
  },
  fields: [arrayField],
  presets: arrayPresets,
  sizeRange: { min: 4, max: 100, step: 1 },
  parse,
  *run(input) {
    const scene = new ArrayScene(input.values);
    const n = scene.length;

    yield scene.frame({
      codeLine: LINE.enter,
      explanation: `Insertion sort ${n} elements. Everything left of i is sorted; each step slides one more value into it.`,
      regions: sortedPrefix(1),
    });

    for (let i = 1; i < n; i++) {
      const key = scene.read(i);
      yield scene.frame({
        codeLine: LINE.key,
        explanation: `Take key = a[${i}] = ${key}. The prefix a[0..${i - 1}] is sorted.`,
        highlights: { active: [i] },
        pointers: { i },
        regions: sortedPrefix(i),
      });

      let j = i - 1;
      for (;;) {
        if (j < 0) {
          yield scene.frame({
            codeLine: LINE.test,
            explanation: `j fell off the front: ${key} is the smallest so far.`,
            pointers: { i },
            regions: sortedPrefix(i),
          });
          break;
        }
        const larger = scene.compareValue(j, key) > 0;
        yield scene.frame({
          codeLine: LINE.test,
          explanation: larger ? `a[${j}] = ${scene.peek(j)} > ${key}: it slides right.` : `a[${j}] = ${scene.peek(j)} <= ${key}: the gap is at ${j + 1}.`,
          highlights: { comparing: [j] },
          pointers: { i, j },
          regions: sortedPrefix(i),
        });
        if (!larger) break;
        scene.write(j + 1, scene.read(j));
        yield scene.frame({
          codeLine: LINE.shift,
          explanation: `Copy a[${j}] to a[${j + 1}].`,
          highlights: { swapped: [j + 1] },
          pointers: { i, j },
          regions: sortedPrefix(i),
        });
        j -= 1;
      }

      scene.write(j + 1, key);
      yield scene.frame({
        codeLine: LINE.place,
        explanation: `Put ${key} at a[${j + 1}]. a[0..${i}] is sorted.`,
        highlights: { sorted: [j + 1] },
        pointers: { i },
        regions: sortedPrefix(i + 1),
      });
    }

    scene.markSortedRange(0, n - 1);
    const counters = scene.counters();
    yield scene.frame({
      codeLine: LINE.loop,
      explanation: `Sorted, with ${counters.comparisons} comparisons and ${counters.writes} writes.`,
      regions: sortedPrefix(n),
    });
  },
});
