/**
 * Longest increasing subsequence, two ways at once: the O(n^2) table of run
 * lengths, and patience sorting's piles found by binary search. Each element
 * lands on the pile whose number is its run length, which is why the piles
 * know the answer's length. Only the table knows which elements make it.
 */

import { parseNumberList } from '../../core/arrayInput';
import { defineAlgorithm, type FieldSpec, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
import { cellRef, colRef, MatrixScene } from '../../core/matrixScene';
import { randomInt, shuffle } from '../../core/random';
import { paneRef, SplitScene } from '../../core/splitScene';
import type { EntityId, Strip, StripItem } from '../../core/types';

const CODE = `function lis(a: number[]): { length: number; sequence: number[] } {
  const n = a.length;
  const L = new Array(n).fill(1);           // O(n^2): L[i] = longest increasing run ending at a[i]
  const tails: number[] = [];               // O(n log n): tails[k] = smallest end of any run of length k + 1

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (a[j] < a[i]) L[i] = Math.max(L[i], L[j] + 1);   // extend the run ending at a[j]
    }

    let lo = 0;                             // the first pile whose top is >= a[i]
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < a[i]) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = a[i];                       // pile lo + 1 is exactly L[i]
  }

  const length = tails.length;              // only the table can say which elements
  const sequence: number[] = [];
  let want = length;
  for (let i = n - 1; i >= 0 && want > 0; i--) {
    if (L[i] === want && (sequence.length === 0 || a[i] < sequence[0])) {
      sequence.unshift(a[i]);
      want--;
    }
  }
  return { length, sequence };
}`;

export const LINE = {
  init: 3,
  element: 6,
  extend: 8,
  search: 11,
  probeRight: 15,
  probeLeft: 16,
  place: 18,
  trace: 21,
  check: 25,
  take: 26,
  ret: 30,
} as const;

export const MAX_LENGTH = 12;
const MIN_VALUE = -99;
const MAX_VALUE = 999;

const TABLE = 'table';
const PILES = 'piles';

const field: FieldSpec = {
  key: 'input',
  label: 'Array',
  kind: 'numbers',
  defaultValue: '10, 9, 2, 5, 3, 7, 101, 18',
  placeholder: '10, 9, 2, 5, 3, 7, 101, 18',
  help: `Whole numbers from ${MIN_VALUE} to ${MAX_VALUE}, up to ${MAX_LENGTH} of them.`,
};

function toParams(values: readonly number[]): ParamMap {
  return { input: values.join(', ') };
}

function ramp(size: number): number[] {
  return Array.from({ length: size }, (_, at) => at + 1);
}

const presets: readonly PresetSpec[] = [
  {
    id: 'classic',
    label: 'Classic',
    build: () => toParams([10, 9, 2, 5, 3, 7, 101, 18]),
  },
  {
    id: 'random',
    label: 'Random',
    build: (size, rng) => toParams(Array.from({ length: size }, () => randomInt(rng, 1, 40))),
  },
  {
    id: 'shuffled',
    label: 'Shuffled 1..n',
    build: (size, rng) => toParams(shuffle(ramp(size), rng)),
  },
  {
    id: 'sorted',
    label: 'Sorted',
    build: (size) => toParams(ramp(size)),
  },
  {
    id: 'reversed',
    label: 'Reversed',
    build: (size) => toParams(ramp(size).reverse()),
  },
];

function parse(params: ParamMap): ParseResult<readonly number[]> {
  const list = parseNumberList(params.input ?? '', { label: 'Array', maxLength: MAX_LENGTH });
  if (!list.ok) return list;
  const bad = list.value.find((value) => !Number.isInteger(value) || value < MIN_VALUE || value > MAX_VALUE);
  if (bad !== undefined) return { ok: false, error: `Array takes whole numbers from ${MIN_VALUE} to ${MAX_VALUE} (got ${bad}).` };
  return list;
}

/** The value row and the run-length row of the table. */
const VALUE = 0;
const RUN = 1;

const value = (i: number): EntityId => paneRef(TABLE, cellRef(VALUE, i));
const run = (i: number): EntityId => paneRef(TABLE, cellRef(RUN, i));
const pile = (k: number): EntityId => paneRef(PILES, cellRef(0, k));
const tableCol = (i: number): EntityId => paneRef(TABLE, colRef(i));
const pileCol = (k: number): EntityId => paneRef(PILES, colRef(k));

export const lis = defineAlgorithm<readonly number[]>({
  meta: {
    id: 'lis',
    name: 'Longest increasing subsequence',
    category: 'dynamic-programming',
    structureKind: 'split',
    blurb: 'The O(n log n) patience-sorting version next to the O(n^2) table.',
    complexity: {
      time: { best: 'O(n log n)', average: 'O(n log n)', worst: 'O(n log n)' },
      space: 'O(n)',
      notes: [
        'The table is O(n^2): every element looks back at every earlier one to find the longest run it can extend.',
        'Patience sorting deals each element onto the leftmost pile whose top is not smaller. The tops stay sorted, so a binary search finds the pile in O(log n).',
        'An element lands on pile k exactly when the longest run ending at it has length k, so the number of piles is the answer. The tops themselves are usually not a valid subsequence.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'reads', 'writes'],
  },
  fields: [field],
  presets,
  sizeRange: { min: 2, max: MAX_LENGTH, step: 1 },
  parse,
  *run(a) {
    const n = a.length;
    const indices = Array.from({ length: n }, (_, i) => String(i));
    const table = new MatrixScene({
      rowHeaders: ['a[i]', 'L[i]'],
      colHeaders: indices,
      rowTitle: 'row',
      colTitle: 'i: index',
      arrowsUnder: true,
    });
    const piles = new MatrixScene({
      rowHeaders: ['top'],
      colHeaders: Array.from({ length: n }, (_, k) => String(k + 1)),
      rowTitle: 'pile',
      colTitle: 'k: run length',
    });
    const scene = new SplitScene([
      { id: TABLE, title: 'O(n^2) - L[i], the longest increasing run that ends at a[i]', scene: table },
      { id: PILES, title: 'O(n log n) - patience piles: tails[k], the smallest end of a run of length k', scene: piles },
    ]);

    const chosen: StripItem[] = [];
    const strips = (): readonly Strip[] => [{ kind: 'output', label: 'lis', items: [...chosen] }];

    for (let i = 0; i < n; i++) table.write(VALUE, i, a[i] ?? 0);
    yield scene.frame({
      codeLine: LINE.init,
      phase: 'setup',
      explanation: `Two answers to one question, side by side. The table finds, for every element, the longest increasing run ending there. The piles find only the length, with a binary search per element instead of a scan.`,
      highlights: { active: indices.map((_, i) => value(i)) },
      strips: strips(),
    });

    let piled = 0;
    for (let i = 0; i < n; i++) {
      const x = a[i] ?? 0;
      table.write(RUN, i, 1);
      yield scene.frame({
        codeLine: LINE.element,
        phase: 'table',
        explanation:
          i === 0
            ? `a[0] = ${x} on its own is a run of length 1, so L[0] = 1.`
            : `a[${i}] = ${x}. On its own it is a run of length 1; now look back at every earlier element it could follow.`,
        highlights: { active: [value(i), run(i)] },
        pointers: { i: tableCol(i) },
        strips: strips(),
      });

      for (let j = 0; j < i; j++) {
        const y = table.read(VALUE, j);
        table.countComparison();
        table.bump('table comparisons');
        if (y >= x) {
          yield scene.frame({
            codeLine: LINE.extend,
            phase: 'table',
            explanation: `a[${j}] = ${y} is not smaller than ${x}, so ${x} cannot follow it.`,
            highlights: { active: [value(i), run(i)], excluded: [value(j), run(j)] },
            pointers: { i: tableCol(i), j: tableCol(j) },
            strips: strips(),
          });
          continue;
        }
        const through = table.read(RUN, j) + 1;
        const before = table.read(RUN, i);
        if (through > before) table.write(RUN, i, through);
        yield scene.frame({
          codeLine: LINE.extend,
          phase: 'table',
          explanation:
            through > before
              ? `${y} < ${x}, so ${x} can extend the run of length ${through - 1} ending at a[${j}]: L[${i}] becomes ${through}.`
              : `${y} < ${x}, but following a[${j}] gives only ${through}, no better than ${before}.`,
          highlights: { active: [value(i), run(i)], comparing: [value(j), run(j)] },
          pointers: { i: tableCol(i), j: tableCol(j) },
          arrows: { [TABLE]: [{ from: { row: RUN, col: j }, to: { row: RUN, col: i }, label: '+1' }] },
          strips: strips(),
        });
      }

      let lo = 0;
      let hi = piled;
      yield scene.frame({
        codeLine: LINE.search,
        phase: 'patience',
        explanation:
          piled === 0
            ? `Now the piles. There are none yet, so ${x} starts pile 1.`
            : `Now the piles: deal ${x} onto the leftmost pile whose top is not smaller than ${x}. The tops are sorted, so binary search between pile ${lo + 1} and ${hi + 1}${hi === piled ? ' (a new pile)' : ''}.`,
        highlights: { active: [value(i)] },
        pointers: { lo: pileCol(lo), hi: pileCol(hi) },
        strips: strips(),
      });

      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const top = piles.read(0, mid);
        piles.countComparison();
        piles.bump('pile comparisons');
        const right = top < x;
        if (right) lo = mid + 1;
        else hi = mid;
        yield scene.frame({
          codeLine: right ? LINE.probeRight : LINE.probeLeft,
          phase: 'patience',
          explanation: right
            ? `Pile ${mid + 1}'s top is ${top} < ${x}: ${x} could go on top of a run that long, so look right of it.`
            : `Pile ${mid + 1}'s top is ${top} ≥ ${x}: this pile works, but one further left might too.`,
          highlights: { active: [value(i)], [right ? 'excluded' : 'comparing']: [pile(mid)] },
          pointers: { lo: pileCol(lo), hi: pileCol(hi), mid: pileCol(mid) },
          strips: strips(),
        });
      }

      const replaced = piles.peek(0, lo);
      piles.write(0, lo, x);
      if (lo === piled) piled += 1;
      const length = table.peek(RUN, i) ?? 1;
      yield scene.frame({
        codeLine: LINE.place,
        phase: 'patience',
        explanation: `${replaced === null ? `${x} starts pile ${lo + 1}` : `${x} covers ${replaced} on pile ${lo + 1}`}, and pile ${lo + 1} is L[${i}] = ${length}: the pile an element lands on is the length of the longest run ending at it.`,
        highlights: { active: [pile(lo), run(i)] },
        pointers: { i: tableCol(i) },
        strips: strips(),
      });
    }

    const tops = Array.from({ length: piled }, (_, k) => piles.peek(0, k) ?? 0);
    let want = piled;
    yield scene.frame({
      codeLine: LINE.trace,
      phase: 'traceback',
      explanation: `${piled} pile${piled === 1 ? '' : 's'}, so the longest increasing subsequence has length ${piled}. The tops ${tops.join(', ')} only give the length. To recover the elements, scan the table from the right for L = ${want}, ${want - 1}, and so on.`,
      highlights: { sorted: tops.map((_, k) => pile(k)) },
      strips: strips(),
    });

    let next: number | null = null;
    for (let i = n - 1; i >= 0 && want > 0; i--) {
      const x = table.read(VALUE, i);
      const length = table.read(RUN, i);
      table.countComparison();
      const after = next;
      const fits = length === want && (after === null || x < after);
      if (fits) {
        chosen.unshift({ id: `i${i}`, label: String(x) });
        table.walk(RUN, i);
        table.walk(VALUE, i);
        next = x;
        want -= 1;
      }
      const explanation = fits
        ? `L[${i}] = ${length}${after === null ? '' : ` and ${x} < ${after}`}: take a[${i}] = ${x}.${want === 0 ? ' That is every element.' : ` Now look for L = ${want}.`}`
        : length !== want
          ? `L[${i}] = ${length}, not ${want}: skip it.`
          : `L[${i}] = ${length}, but ${x} is not smaller than ${after ?? ''}, the element already chosen after it: skip it.`;
      yield scene.frame({
        codeLine: fits ? LINE.take : LINE.check,
        phase: 'traceback',
        explanation,
        highlights: { active: [value(i), run(i)], ...(fits ? { candidate: [`output:i${i}`] } : {}) },
        pointers: { i: tableCol(i) },
        strips: strips(),
      });
    }

    yield scene.frame({
      codeLine: LINE.ret,
      phase: 'done',
      explanation: `Length ${piled}: ${chosen.map((item) => item.label).join(' < ')}. ${
        tops.join() === chosen.map((item) => item.label).join()
          ? 'The pile tops happen to match it this time; usually they do not.'
          : `The pile tops read ${tops.join(', ')}: the right length, but not this answer, and not always in input order.`
      } The table compared ${table.counters().extra['table comparisons'] ?? 0} pairs; the piles needed ${piles.counters().extra['pile comparisons'] ?? 0} comparisons.`,
      highlights: { candidate: chosen.map((item) => `output:${item.id}`) },
      strips: strips(),
    });
  },
});
