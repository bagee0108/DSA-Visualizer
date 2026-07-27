/**
 * Binary max-heap: push, pop and heapify, shown as a tree and as the backing
 * array at the same time.
 */

import { defineAlgorithm, type FieldSpec, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
import { arrayField, parseNumberList } from '../../core/arrayInput';
import { randomInt } from '../../core/random';
import { ArrayScene } from '../../core/scene';
import type { ArrayRegion, Frame } from '../../core/types';

type HeapOp = { readonly kind: 'push'; readonly value: number } | { readonly kind: 'pop' } | { readonly kind: 'heapify' };

interface HeapInput {
  readonly values: readonly number[];
  readonly ops: readonly HeapOp[];
}

const CODE = `function push(a: number[], value: number): void {
  a.push(value);                              // append as the last leaf
  let i = a.length - 1;
  while (i > 0 && a[(i - 1) >> 1] < a[i]) {   // sift up while the parent is smaller
    swap(a, i, (i - 1) >> 1);
    i = (i - 1) >> 1;
  }
}

function pop(a: number[]): number {
  const top = a[0];
  swap(a, 0, a.length - 1);                   // last leaf takes the root
  a.pop();                                    // drop the old max
  siftDown(a, 0);
  return top;
}

function heapify(a: number[]): void {         // Floyd: O(n), bottom up
  for (let i = (a.length >> 1) - 1; i >= 0; i--) siftDown(a, i);
}

function siftDown(a: number[], i: number): void {
  const n = a.length;
  while (true) {
    let largest = i;
    const l = 2 * i + 1, r = 2 * i + 2;
    if (l < n && a[l] > a[largest]) largest = l;
    if (r < n && a[r] > a[largest]) largest = r;
    if (largest === i) return;                // heap property holds here
    swap(a, i, largest);
    i = largest;
  }
}`;

const LINE = {
  pushEnter: 1,
  pushAppend: 2,
  pushLoop: 4,
  pushSwap: 5,
  pushMove: 6,
  popEnter: 10,
  popTop: 11,
  popSwap: 12,
  popShrink: 13,
  popSift: 14,
  popReturn: 15,
  heapifyEnter: 18,
  heapifyLoop: 19,
  siftEnter: 22,
  siftChildren: 26,
  siftLeft: 27,
  siftRight: 28,
  siftDone: 29,
  siftSwap: 30,
  siftMove: 31,
} as const;

type Gen = Generator<Frame, void, undefined>;

function heapRegion(scene: ArrayScene): ArrayRegion[] {
  return scene.length === 0 ? [] : [{ from: 0, to: scene.length - 1, label: `heap (${scene.length})`, tone: 'active' }];
}

function* siftDown(scene: ArrayScene, start: number, phase: string): Gen {
  let i = start;
  const n = scene.length;
  scene.pushCall({ label: `siftDown(${start})`, codeLine: LINE.siftEnter });

  for (;;) {
    const l = 2 * i + 1;
    const r = 2 * i + 2;
    let largest = i;

    if (l >= n) {
      yield scene.frame({
        codeLine: LINE.siftChildren,
        explanation: `Index ${i} (${scene.peek(i)}) has no children: it is a leaf, done.`,
        highlights: { sorted: [i] },
        pointers: { i },
        regions: heapRegion(scene),
        includeSorted: false,
        phase,
      });
      break;
    }

    if (scene.compare(l, largest) > 0) largest = l;
    if (r < n && scene.compare(r, largest) > 0) largest = r;

    yield scene.frame({
      codeLine: r < n ? LINE.siftRight : LINE.siftLeft,
      explanation:
        largest === i
          ? `${scene.peek(i)} at ${i} is at least as large as ${r < n ? 'both children' : 'its child'}: the heap property holds here.`
          : `Child ${scene.peek(largest)} at ${largest} beats ${scene.peek(i)} at ${i}.`,
      highlights: { comparing: r < n ? [l, r] : [l], active: [i] },
      pointers: { i },
      regions: heapRegion(scene),
      phase,
    });

    if (largest === i) {
      yield scene.frame({
        codeLine: LINE.siftDone,
        explanation: `Stop: nothing below ${i} needs to change.`,
        highlights: { sorted: [i] },
        pointers: { i },
        regions: heapRegion(scene),
        includeSorted: false,
        phase,
      });
      break;
    }

    const sinking = scene.peek(i);
    scene.swap(i, largest);
    yield scene.frame({
      codeLine: LINE.siftSwap,
      explanation: `Swap ${sinking} down with ${scene.peek(i)}.`,
      highlights: { swapped: [i, largest] },
      pointers: { i },
      regions: heapRegion(scene),
      phase,
    });
    i = largest;
    yield scene.frame({
      codeLine: LINE.siftMove,
      explanation: `Follow ${sinking} to index ${i}.`,
      highlights: { active: [i] },
      pointers: { i },
      regions: heapRegion(scene),
      phase,
    });
  }
  scene.popCall();
}

function* push(scene: ArrayScene, value: number): Gen {
  const index = scene.push(value);
  scene.setHeapSize(scene.length);
  yield scene.frame({
    codeLine: LINE.pushAppend,
    explanation: `push(${value}): append it as the last leaf at index ${index}. The tree stays complete by construction.`,
    highlights: { candidate: [index] },
    pointers: { i: index },
    regions: heapRegion(scene),
    phase: 'push',
  });

  let i = index;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    const parentSmaller = scene.compare(parent, i) < 0;
    yield scene.frame({
      codeLine: LINE.pushLoop,
      explanation: parentSmaller
        ? `Parent ${scene.peek(parent)} at ${parent} is smaller than ${scene.peek(i)}: sift up.`
        : `Parent ${scene.peek(parent)} at ${parent} is not smaller than ${scene.peek(i)}: the heap property holds, stop.`,
      highlights: { comparing: [parent], candidate: [i] },
      pointers: { i, parent },
      regions: heapRegion(scene),
      phase: 'push',
    });
    if (!parentSmaller) break;

    scene.swap(i, parent);
    yield scene.frame({
      codeLine: LINE.pushSwap,
      explanation: `Swap ${scene.peek(parent)} up into index ${parent}.`,
      highlights: { swapped: [i, parent] },
      pointers: { i: parent },
      regions: heapRegion(scene),
      phase: 'push',
    });
    i = parent;
  }

  if (i === 0) {
    yield scene.frame({
      codeLine: LINE.pushLoop,
      explanation: `${scene.peek(0)} reached the root: it is the new maximum.`,
      highlights: { sorted: [0] },
      pointers: { i: 0 },
      regions: heapRegion(scene),
      includeSorted: false,
      phase: 'push',
    });
  }
}

function* pop(scene: ArrayScene): Gen {
  if (scene.length === 0) {
    yield scene.frame({ codeLine: LINE.popEnter, explanation: `pop() on an empty heap: nothing to remove.`, phase: 'pop' });
    return;
  }
  const top = scene.read(0);
  const last = scene.length - 1;
  yield scene.frame({
    codeLine: LINE.popTop,
    explanation: `pop(): the maximum ${top} sits at the root. It has to leave without breaking the shape.`,
    highlights: { pivot: [0] },
    pointers: { i: 0 },
    regions: heapRegion(scene),
    phase: 'pop',
  });

  if (last > 0) {
    scene.swap(0, last);
    yield scene.frame({
      codeLine: LINE.popSwap,
      explanation: `Swap the last leaf ${scene.peek(0)} into the root, so the hole is at the end where removal is O(1).`,
      highlights: { swapped: [0, last] },
      pointers: { i: 0 },
      regions: heapRegion(scene),
      phase: 'pop',
    });
  }

  scene.pop();
  scene.setHeapSize(scene.length);
  scene.bump('popped');
  yield scene.frame({
    codeLine: LINE.popShrink,
    explanation: `Drop ${top}. The heap has ${scene.length} element(s) left${scene.length > 0 ? `, and ${scene.peek(0)} at the root is probably too small` : ''}.`,
    highlights: scene.length > 0 ? { active: [0] } : {},
    regions: heapRegion(scene),
    phase: 'pop',
  });

  if (scene.length > 1) {
    yield scene.frame({
      codeLine: LINE.popSift,
      explanation: `siftDown(0) restores the heap property.`,
      highlights: { active: [0] },
      pointers: { i: 0 },
      regions: heapRegion(scene),
      phase: 'pop',
    });
    yield* siftDown(scene, 0, 'pop');
  }

  yield scene.frame({
    codeLine: LINE.popReturn,
    explanation: `Return ${top}.${scene.length > 0 ? ` The new maximum is ${scene.peek(0)}.` : ''}`,
    highlights: scene.length > 0 ? { sorted: [0] } : {},
    regions: heapRegion(scene),
    includeSorted: false,
    phase: 'pop',
  });
}

function* heapify(scene: ArrayScene): Gen {
  const n = scene.length;
  scene.setHeapSize(n);
  yield scene.frame({
    codeLine: LINE.heapifyEnter,
    explanation: `heapify: turn the raw array into a heap bottom-up. Indices ${n >> 1}..${n - 1} are leaves and already valid.`,
    highlights: { excluded: Array.from({ length: n - (n >> 1) }, (_, k) => (n >> 1) + k) },
    regions: heapRegion(scene),
    phase: 'heapify',
  });

  for (let i = (n >> 1) - 1; i >= 0; i--) {
    scene.countCall();
    yield scene.frame({
      codeLine: LINE.heapifyLoop,
      explanation: `siftDown(${i}): both subtrees below are heaps already, so one sift fixes this one.`,
      highlights: { active: [i] },
      pointers: { i },
      regions: heapRegion(scene),
      phase: 'heapify',
    });
    yield* siftDown(scene, i, 'heapify');
  }

  yield scene.frame({
    codeLine: LINE.heapifyLoop,
    explanation: `Heap built in ${scene.counters().comparisons} comparisons - linear in n, not n log n, because most nodes are near the bottom and barely move.`,
    highlights: { sorted: [0] },
    regions: heapRegion(scene),
    includeSorted: false,
    phase: 'heapify',
  });
}

function parseOps(raw: string): ParseResult<HeapOp[]> {
  const ops: HeapOp[] = [];
  const tokens = raw.split(/[;\n,]+/).map((token) => token.trim()).filter((token) => token.length > 0);
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower === 'pop') ops.push({ kind: 'pop' });
    else if (lower === 'heapify' || lower === 'build') ops.push({ kind: 'heapify' });
    else {
      const match = /^(?:push|insert|\+)\s*(-?\d+(?:\.\d+)?)$/i.exec(token);
      if (match === null) return { ok: false, error: `Cannot read "${token}". Use "heapify", "push 42" (or +42) and "pop".` };
      ops.push({ kind: 'push', value: Number(match[1]) });
    }
  }
  return { ok: true, value: ops };
}

function parse(params: ParamMap): ParseResult<HeapInput> {
  const values = parseNumberList(params.input ?? '', { label: 'Array', minLength: 0, maxLength: 63 });
  if (!values.ok) return values;
  const ops = parseOps(params.ops ?? '');
  if (!ops.ok) return ops;
  if (values.value.length === 0 && ops.value.length === 0) return { ok: false, error: 'Give some values or some operations.' };
  return { ok: true, value: { values: values.value, ops: ops.value } };
}

const opsSpec: FieldSpec = {
  key: 'ops',
  label: 'Operations',
  kind: 'text',
  defaultValue: 'heapify; push 90; pop; pop; push 3',
  placeholder: 'heapify; push 42; pop',
  help: 'heapify, push N (or +N), pop - separated by ; or newlines. Without heapify the array is treated as an existing heap.',
};

const presets: readonly PresetSpec[] = [
  {
    id: 'random',
    label: 'Random',
    build: (size, rng) => ({
      input: Array.from({ length: size }, () => randomInt(rng, 1, 99)).join(', '),
      ops: `heapify; push ${randomInt(rng, 60, 99)}; pop; pop`,
    }),
  },
  {
    id: 'sorted',
    label: 'Sorted ascending',
    build: (size) => ({
      input: Array.from({ length: size }, (_, index) => index + 1).join(', '),
      ops: 'heapify; pop; pop; pop',
    }),
  },
  {
    id: 'pushes',
    label: 'Build by pushes',
    build: (size, rng) => ({
      input: '',
      ops: Array.from({ length: Math.min(size, 16) }, () => `push ${randomInt(rng, 1, 99)}`).join('; ') + '; pop',
    }),
  },
];

export const binaryHeap = defineAlgorithm<HeapInput>({
  meta: {
    id: 'binary-heap',
    name: 'Binary heap',
    category: 'trees',
    structureKind: 'array',
    blurb: 'Push, pop and O(n) heapify, shown as a tree and as the backing array.',
    complexity: {
      time: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
      space: 'O(n)',
      notes: [
        'The tree is the array: node i has children 2i+1 and 2i+2 and parent (i-1)>>1. No pointers exist.',
        'heapify is O(n), not O(n log n): half the nodes are leaves and sift zero levels, a quarter sift one, and the series sums to 2n.',
        'push and pop are O(log n) because the tree is complete, so its height is exactly floor(log2 n).',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'swaps', 'accesses'],
    inPlace: true,
  },
  fields: [{ ...arrayField, label: 'Values', defaultValue: '12, 45, 7, 88, 23, 56, 9, 31, 64', help: 'Up to 63 values.' }, opsSpec],
  presets,
  sizeRange: { min: 1, max: 40, step: 1 },
  parse,
  *run(input) {
    const scene = new ArrayScene(input.values);
    scene.setHeapSize(scene.length);

    const heapifies = input.ops.some((op) => op.kind === 'heapify');
    yield scene.frame({
      codeLine: 0,
      explanation:
        scene.length === 0
          ? `Start from an empty heap.`
          : heapifies
            ? `${scene.length} raw values. The tree above is just the array read as a heap - it is not valid yet.`
            : `${scene.length} values, treated as an existing heap.`,
      regions: heapRegion(scene),
    });

    for (const op of input.ops) {
      if (op.kind === 'heapify') yield* heapify(scene);
      else if (op.kind === 'push') yield* push(scene, op.value);
      else yield* pop(scene);
    }

    const counters = scene.counters();
    yield scene.frame({
      codeLine: 0,
      explanation: `Done: ${scene.length} element(s) in the heap${scene.length > 0 ? `, max ${scene.peek(0)}` : ''}. ${counters.comparisons} comparisons, ${counters.swaps} swaps.`,
      regions: heapRegion(scene),
      phase: 'done',
    });
  },
});
