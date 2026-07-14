/** Heapsort, drawn as a tree and as the backing array at the same time. */

import { arrayField, arrayPresets, parseNumberList } from '../../core/arrayInput';
import { defineAlgorithm, type ParamMap, type ParseResult } from '../../core/define';
import { ArrayScene } from '../../core/scene';
import type { ArrayRegion, Frame } from '../../core/types';

interface HeapsortInput {
  readonly values: readonly number[];
}

const CODE = `function heapsort(a: number[]): void {
  const n = a.length;

  for (let i = (n >> 1) - 1; i >= 0; i--) {  // Floyd build: O(n), not O(n log n)
    siftDown(a, i, n);
  }

  for (let end = n - 1; end > 0; end--) {
    swap(a, 0, end);                         // the max goes to its final slot
    siftDown(a, 0, end);                     // restore the heap on what is left
  }
}

function siftDown(a: number[], i: number, size: number): void {
  while (true) {
    const l = 2 * i + 1;
    const r = 2 * i + 2;
    let largest = i;

    if (l < size && a[l] > a[largest]) largest = l;
    if (r < size && a[r] > a[largest]) largest = r;
    if (largest === i) return;               // heap property holds again

    swap(a, i, largest);
    i = largest;                             // follow the element down
  }
}`;

const LINE = {
  enter: 1,
  buildLoop: 4,
  buildSift: 5,
  sortLoop: 8,
  swapMax: 9,
  restore: 10,
  enterSift: 14,
  children: 16,
  initLargest: 18,
  checkLeft: 20,
  checkRight: 21,
  settled: 22,
  swapDown: 24,
  descend: 25,
} as const;

function heapRegion(size: number, total: number): ArrayRegion[] {
  const regions: ArrayRegion[] = [];
  if (size > 0) regions.push({ from: 0, to: size - 1, label: `heap [0..${size - 1}]`, tone: 'active' });
  if (size < total) regions.push({ from: size, to: total - 1, label: 'sorted tail', tone: 'sorted' });
  return regions;
}

function* siftDown(
  scene: ArrayScene,
  start: number,
  size: number,
  phase: string,
): Generator<Frame, void, undefined> {
  const total = scene.length;
  let i = start;

  scene.pushCall({ label: `siftDown(${start}, ${size})`, codeLine: LINE.enterSift });

  for (;;) {
    const l = 2 * i + 1;
    const r = 2 * i + 2;
    let largest = i;

    yield scene.frame({
      codeLine: LINE.children,
      explanation:
        l >= size
          ? `Node ${i} (value ${scene.peek(i)}) is a leaf, so there is nothing below it.`
          : `Node ${i} holds ${scene.peek(i)}; its children are ${l}${r < size ? ` and ${r}` : ''}.`,
      highlights: { active: [i], candidate: l < size ? (r < size ? [l, r] : [l]) : [] },
      pointers: { i },
      regions: heapRegion(size, total),
      phase,
    });

    if (l < size && scene.compare(l, largest) > 0) {
      largest = l;
      yield scene.frame({
        codeLine: LINE.checkLeft,
        explanation: `Left child a[${l}] = ${scene.peek(l)} beats a[${i}] = ${scene.peek(i)}, so it is the new candidate.`,
        highlights: { comparing: [l, i] },
        pointers: { i, l },
        regions: heapRegion(size, total),
        phase,
      });
    } else if (l < size) {
      yield scene.frame({
        codeLine: LINE.checkLeft,
        explanation: `Left child a[${l}] = ${scene.peek(l)} does not beat a[${i}] = ${scene.peek(i)}.`,
        highlights: { comparing: [l, i] },
        pointers: { i, l },
        regions: heapRegion(size, total),
        phase,
      });
    }

    if (r < size && scene.compare(r, largest) > 0) {
      largest = r;
      yield scene.frame({
        codeLine: LINE.checkRight,
        explanation: `Right child a[${r}] = ${scene.peek(r)} is bigger still, so it becomes the largest.`,
        highlights: { comparing: [r, largest] },
        pointers: { i, r },
        regions: heapRegion(size, total),
        phase,
      });
    } else if (r < size) {
      yield scene.frame({
        codeLine: LINE.checkRight,
        explanation: `Right child a[${r}] = ${scene.peek(r)} does not beat the current largest a[${largest}] = ${scene.peek(largest)}.`,
        highlights: { comparing: [r, largest] },
        pointers: { i, r },
        regions: heapRegion(size, total),
        phase,
      });
    }

    if (largest === i) {
      yield scene.frame({
        codeLine: LINE.settled,
        explanation: `a[${i}] = ${scene.peek(i)} is at least as large as both children, so this subtree is a valid heap.`,
        highlights: { sorted: [] },
        pointers: { i },
        regions: heapRegion(size, total),
        includeSorted: false,
        phase,
      });
      scene.popCall();
      return;
    }

    const moving = scene.peek(i);
    const promoted = scene.peek(largest);
    scene.swap(i, largest);
    yield scene.frame({
      codeLine: LINE.swapDown,
      explanation: `Swap ${moving} down and ${promoted} up: the parent must dominate its children.`,
      highlights: { swapped: [i, largest] },
      pointers: { i },
      regions: heapRegion(size, total),
      phase,
    });

    i = largest;
    yield scene.frame({
      codeLine: LINE.descend,
      explanation: `Follow ${moving} down to index ${i} and check its new children.`,
      highlights: { active: [i] },
      pointers: { i },
      regions: heapRegion(size, total),
      phase,
    });
  }
}

function parse(params: ParamMap): ParseResult<HeapsortInput> {
  const parsed = parseNumberList(params.input ?? '', { label: 'Array' });
  if (!parsed.ok) return parsed;
  return { ok: true, value: { values: parsed.value } };
}

export const heapsort = defineAlgorithm<HeapsortInput>({
  meta: {
    id: 'heapsort',
    name: 'Heapsort',
    category: 'sorting',
    structureKind: 'array',
    blurb: 'Build a max-heap in place, then pop the root n times.',
    complexity: {
      time: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)' },
      space: 'O(1)',
      notes: [
        'The only O(n log n) worst case here that is also in place.',
        'Floyd build is O(n): most nodes are near the leaves and sift down barely at all.',
        'Unstable, and its scattered memory access makes it lose to quicksort in practice.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'swaps', 'accesses'],
    stable: false,
    inPlace: true,
  },
  fields: [arrayField],
  presets: arrayPresets,
  sizeRange: { min: 4, max: 120, step: 1 },
  parse,
  *run(input) {
    const scene = new ArrayScene(input.values);
    const n = scene.length;
    scene.setHeapSize(n);

    yield scene.frame({
      codeLine: LINE.enter,
      explanation: `Heapsort ${n} elements. The tree above and the bars below are the same array: node i has children 2i+1 and 2i+2.`,
      regions: heapRegion(n, n),
      phase: 'build',
    });

    for (let i = (n >> 1) - 1; i >= 0; i--) {
      scene.countCall();
      yield scene.frame({
        codeLine: LINE.buildLoop,
        explanation: `Build phase: sift down from node ${i}. Nodes past ${(n >> 1) - 1} are leaves, so they are already valid heaps.`,
        highlights: { active: [i] },
        pointers: { i },
        regions: heapRegion(n, n),
        phase: 'build',
      });
      yield* siftDown(scene, i, n, 'build');
    }

    yield scene.frame({
      codeLine: LINE.sortLoop,
      explanation: `Heap built: a[0] = ${scene.peek(0)} is the maximum. Total cost of the build was ${scene.counters().comparisons} comparisons, which is linear in n.`,
      highlights: { candidate: [0] },
      regions: heapRegion(n, n),
      phase: 'build',
    });

    for (let end = n - 1; end > 0; end--) {
      const max = scene.peek(0);
      scene.swap(0, end);
      scene.markSorted(end);
      scene.setHeapSize(end);
      yield scene.frame({
        codeLine: LINE.swapMax,
        explanation: `Swap the max ${max} into slot ${end}: that is its final position. The heap shrinks to ${end} elements.`,
        highlights: { swapped: [0, end] },
        pointers: { end },
        regions: heapRegion(end, n),
        phase: 'sort',
      });

      scene.countCall();
      yield scene.frame({
        codeLine: LINE.restore,
        explanation: `a[0] = ${scene.peek(0)} came up from a leaf and probably breaks the heap, so sift it back down.`,
        highlights: { active: [0] },
        regions: heapRegion(end, n),
        phase: 'sort',
      });
      yield* siftDown(scene, 0, end, 'sort');
    }

    scene.markSorted(0);
    scene.setHeapSize(null);
    const counters = scene.counters();
    yield scene.frame({
      codeLine: 0,
      explanation: `Sorted. ${counters.comparisons} comparisons and ${counters.swaps} swaps, with no extra memory.`,
      phase: 'done',
    });
  },
});
