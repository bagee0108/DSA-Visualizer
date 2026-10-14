/**
 * 0/1 knapsack: the item-by-capacity table and the rolling one-row version,
 * filled in lockstep so each row of the table can be checked against the row.
 * Only the table can trace the choices back.
 */

import { parseNumberList } from '../../core/arrayInput';
import { defineAlgorithm, type FieldSpec, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
import { cellRef, colRef, MatrixScene, rowRef } from '../../core/matrixScene';
import { randomInt } from '../../core/random';
import { paneRef, SplitScene } from '../../core/splitScene';
import type { EntityId, MatrixArrow, Strip, StripItem } from '../../core/types';

interface KnapsackInput {
  readonly weights: readonly number[];
  readonly values: readonly number[];
  readonly capacity: number;
}

const CODE = `function knapsack(weights: number[], values: number[], capacity: number): { best: number; taken: number[] } {
  const n = weights.length;
  const T = table(n + 1, capacity + 1, 0);    // T[i][w]: best value from items 1..i within capacity w
  const dp = new Array(capacity + 1).fill(0); // the same answers, kept one row at a time

  for (let i = 1; i <= n; i++) {
    const wi = weights[i - 1];
    const vi = values[i - 1];
    for (let w = capacity; w >= 0; w--) {     // right to left, so dp[w - wi] is still row i - 1
      if (wi > w) {
        T[i][w] = T[i - 1][w];                // too heavy: skip it; dp[w] already says so
      } else {
        T[i][w] = Math.max(T[i - 1][w], T[i - 1][w - wi] + vi);   // skip, or take
        dp[w] = Math.max(dp[w], dp[w - wi] + vi);
      }
    }
  }

  const taken: number[] = [];                 // only the table remembers the choices
  let w = capacity;
  for (let i = n; i > 0; i--) {
    if (T[i][w] !== T[i - 1][w]) {
      taken.unshift(i - 1);
      w -= weights[i - 1];
    }
  }
  return { best: dp[capacity], taken };
}`;

const LINE = {
  table: 3,
  row: 4,
  item: 6,
  rowDone: 16,
  heavy: 11,
  choose: 13,
  roll: 14,
  trace: 19,
  test: 22,
  take: 23,
  ret: 27,
} as const;

export const MAX_ITEMS = 8;
export const MAX_CAPACITY = 12;
const MAX_VALUE = 99;

const TABLE = 'table';
const ROW = 'row';

const fields: readonly FieldSpec[] = [
  {
    key: 'weights',
    label: 'Weights',
    kind: 'numbers',
    defaultValue: '1, 3, 4, 5',
    placeholder: '1, 3, 4, 5',
    help: `Whole numbers from 1 to ${MAX_CAPACITY}, one per item, up to ${MAX_ITEMS} items.`,
  },
  {
    key: 'values',
    label: 'Values',
    kind: 'numbers',
    defaultValue: '1, 4, 5, 7',
    placeholder: '1, 4, 5, 7',
    help: `Whole numbers from 0 to ${MAX_VALUE}, one per weight.`,
  },
  {
    key: 'capacity',
    label: 'Capacity',
    kind: 'number',
    defaultValue: '7',
    help: `The most weight the bag holds, 1 to ${MAX_CAPACITY}.`,
    min: 1,
    max: MAX_CAPACITY,
  },
];

function toParams(weights: readonly number[], values: readonly number[], capacity: number): ParamMap {
  return { weights: weights.join(', '), values: values.join(', '), capacity: String(capacity) };
}

const presets: readonly PresetSpec[] = [
  {
    id: 'classic',
    label: 'Classic',
    build: () => toParams([1, 3, 4, 5], [1, 4, 5, 7], 7),
  },
  {
    id: 'greedy',
    label: 'Greedy fails',
    // Best value per kilo first takes the 1 and the 2 for 16; the 2 and the 3 make 22.
    build: () => toParams([1, 2, 3], [6, 10, 12], 5),
  },
  {
    id: 'random',
    label: 'Random',
    build: (size, rng) => {
      const count = Math.min(MAX_ITEMS, Math.max(1, size));
      const capacity = randomInt(rng, 6, MAX_CAPACITY);
      const weights = Array.from({ length: count }, () => randomInt(rng, 1, Math.ceil(capacity / 2)));
      const values = weights.map((weight) => weight * randomInt(rng, 1, 4) + randomInt(rng, 0, 3));
      return toParams(weights, values, capacity);
    },
  },
];

function wholeNumbers(raw: string, label: string, min: number, max: number): ParseResult<number[]> {
  const list = parseNumberList(raw, { label, maxLength: MAX_ITEMS });
  if (!list.ok) return list;
  const bad = list.value.find((value) => !Number.isInteger(value) || value < min || value > max);
  if (bad !== undefined) return { ok: false, error: `${label} must be whole numbers from ${min} to ${max} (got ${bad}).` };
  return list;
}

function parse(params: ParamMap): ParseResult<KnapsackInput> {
  const weights = wholeNumbers(params.weights ?? '', 'Weights', 1, MAX_CAPACITY);
  if (!weights.ok) return weights;
  const values = wholeNumbers(params.values ?? '', 'Values', 0, MAX_VALUE);
  if (!values.ok) return values;
  if (values.value.length !== weights.value.length) {
    return { ok: false, error: `Give one value per weight (${weights.value.length} weights, ${values.value.length} values).` };
  }
  const capacity = Number((params.capacity ?? '').trim());
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
    return { ok: false, error: `Capacity must be a whole number from 1 to ${MAX_CAPACITY}.` };
  }
  return { ok: true, value: { weights: weights.value, values: values.value, capacity } };
}

const ITEM_NAMES = 'ABCDEFGH';

function nameOf(index: number): string {
  return ITEM_NAMES[index] ?? String(index + 1);
}

const t = (row: number, col: number): EntityId => paneRef(TABLE, cellRef(row, col));
const d = (col: number): EntityId => paneRef(ROW, cellRef(0, col));

export const knapsack = defineAlgorithm<KnapsackInput>({
  meta: {
    id: 'knapsack',
    name: '0/1 knapsack',
    category: 'dynamic-programming',
    structureKind: 'split',
    blurb: 'Weight-by-item table, plus the rolling one-dimensional version.',
    complexity: {
      time: { best: 'O(nW)', average: 'O(nW)', worst: 'O(nW)' },
      space: 'O(nW), or O(W) rolled',
      notes: [
        'Each cell asks one question about one item: skip it and keep the best from above, or take it and add its value to the best that fits in the room left.',
        'Row i only reads row i - 1, so one row is enough if it is updated right to left: dp[w - wi] is then still last row\'s value. Left to right would let an item be taken twice, which is the unbounded knapsack.',
        'O(nW) is pseudo-polynomial: W is a number, not a length, so doubling the digits of the capacity squares the work. The problem is NP-hard in general.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'reads', 'writes'],
  },
  fields,
  presets,
  sizeRange: { min: 1, max: MAX_ITEMS, step: 1 },
  sizeOf: (params) => (params.weights ?? '').split(/[\s,;]+/).filter((token) => token.length > 0).length,
  parse,
  *run({ weights, values, capacity }) {
    const n = weights.length;
    const capacities = Array.from({ length: capacity + 1 }, (_, w) => String(w));
    const table = new MatrixScene({
      rowHeaders: ['∅', ...weights.map((weight, at) => `${nameOf(at)} ${weight}/${values[at] ?? 0}`)],
      colHeaders: capacities,
      rowTitle: 'i: items 1..i',
      colTitle: 'w: capacity',
    });
    const row = new MatrixScene({ rowHeaders: ['dp'], colHeaders: capacities, rowTitle: 'one row', colTitle: 'w: capacity' });
    const scene = new SplitScene([
      { id: TABLE, title: 'T[i][w] - best value from the first i items within capacity w', scene: table },
      { id: ROW, title: 'dp[w] - the same answers, rolled into one row', scene: row },
    ]);

    const taken: StripItem[] = [];
    let carried = 0;
    const strips = (): readonly Strip[] => [{ kind: 'output', label: 'taken', items: [...taken] }];
    const items = weights.map((weight, at) => `${nameOf(at)} (weight ${weight}, value ${values[at] ?? 0})`).join(', ');

    yield scene.frame({
      codeLine: LINE.table,
      phase: 'setup',
      explanation: `Items ${items}; the bag holds ${capacity}. Each row header reads name weight/value. T[i][w] will be the best value using only the first i items with capacity w.`,
      strips: strips(),
    });

    const base: EntityId[] = [];
    for (let w = 0; w <= capacity; w++) {
      table.write(0, w, 0);
      row.write(0, w, 0);
      base.push(t(0, w), d(w));
    }
    yield scene.frame({
      codeLine: LINE.row,
      phase: 'base case',
      explanation: 'With no items the bag is worth 0 at every capacity. Row 0 of the table and the rolling row both start as zeros.',
      highlights: { active: base },
      strips: strips(),
    });

    for (let i = 1; i <= n; i++) {
      const wi = weights[i - 1] ?? 0;
      const vi = values[i - 1] ?? 0;
      const name = nameOf(i - 1);

      yield scene.frame({
        codeLine: LINE.item,
        phase: 'fill',
        explanation: `Item ${name}: weight ${wi}, value ${vi}. Row ${i} is filled right to left, so the rolling row still holds row ${i - 1}'s answers to the left of where it is working.`,
        highlights: { active: [paneRef(TABLE, rowRef(i))], comparing: [paneRef(TABLE, rowRef(i - 1))] },
        pointers: { i: paneRef(TABLE, rowRef(i)) },
        strips: strips(),
      });

      for (let w = capacity; w >= wi; w--) {
        const skip = table.read(i - 1, w);
        const take = table.read(i - 1, w - wi) + vi;
        table.countComparison();
        const best = Math.max(skip, take);
        table.write(i, w, best);

        const keep = row.read(0, w);
        const rolled = row.read(0, w - wi) + vi;
        row.countComparison();
        row.write(0, w, Math.max(keep, rolled));

        const tookIt = take > skip;
        const tie = take === skip;
        const verdict = tie ? `A tie at ${best}` : tookIt ? `Taking wins: ${best}` : `Skipping wins: ${best}`;
        const tableArrows: MatrixArrow[] = [
          { from: { row: i - 1, col: w }, to: { row: i, col: w }, label: 'skip' },
          { from: { row: i - 1, col: w - wi }, to: { row: i, col: w }, label: 'take' },
        ];
        const rowArrows: MatrixArrow[] = [{ from: { row: 0, col: w - wi }, to: { row: 0, col: w }, label: 'take' }];
        yield scene.frame({
          codeLine: LINE.choose,
          phase: 'fill',
          explanation: `Capacity ${w}: skip ${name} and keep ${skip}, or take it and add ${vi} to the best in the ${w - wi} left, ${take - vi} + ${vi} = ${take}. ${verdict}. The rolling row makes the same choice in place.`,
          highlights: {
            active: [t(i, w), d(w)],
            comparing: [...(take >= skip ? [t(i - 1, w - wi), d(w - wi)] : []), ...(skip >= take ? [t(i - 1, w)] : [])],
            excluded: tie ? [] : tookIt ? [t(i - 1, w)] : [t(i - 1, w - wi), d(w - wi)],
          },
          pointers: { i: paneRef(TABLE, rowRef(i)), w: paneRef(TABLE, colRef(w)) },
          arrows: { [TABLE]: tableArrows, [ROW]: rowArrows },
          strips: strips(),
        });
      }

      // Weights are at least 1, so capacity 0 always lands here.
      const light: EntityId[] = [];
      const above: EntityId[] = [];
      const kept: EntityId[] = [];
      for (let w = Math.min(wi - 1, capacity); w >= 0; w--) {
        table.write(i, w, table.read(i - 1, w));
        light.push(t(i, w));
        above.push(t(i - 1, w));
        kept.push(d(w));
      }
      const range = wi > capacity ? 'at every capacity' : wi === 1 ? 'at capacity 0' : `at capacities 0 to ${wi - 1}`;
      yield scene.frame({
        codeLine: LINE.heavy,
        phase: 'fill',
        explanation: `${name} weighs ${wi}, too much ${range}, so those cells copy the answer from above. The rolling row does nothing there: it already holds those answers. That is the work one row saves.`,
        highlights: { active: light, comparing: above, sorted: kept },
        pointers: { i: paneRef(TABLE, rowRef(i)) },
        strips: strips(),
      });

      const done: EntityId[] = [];
      for (let w = 0; w <= capacity; w++) done.push(t(i, w), d(w));
      yield scene.frame({
        codeLine: LINE.rowDone,
        phase: 'fill',
        explanation: `Row ${i} is done, and the rolling row now reads exactly the same. Right to left kept every dp[w - ${wi}] at its row ${i - 1} value until it was used; left to right could take ${name} twice.`,
        highlights: { sorted: done },
        pointers: { i: paneRef(TABLE, rowRef(i)) },
        strips: strips(),
      });
    }

    const best = row.peek(0, capacity) ?? 0;
    let w = capacity;
    table.walk(n, w);
    yield scene.frame({
      codeLine: LINE.trace,
      phase: 'traceback',
      explanation: `The best value is ${best}, in T[${n}][${capacity}] and dp[${capacity}] alike. Only the table can say which items make it: the rolling row overwrote every earlier choice. Walk the table back up.`,
      highlights: { active: [t(n, w)], sorted: [d(capacity)] },
      pointers: { i: paneRef(TABLE, rowRef(n)), w: paneRef(TABLE, colRef(w)) },
      strips: strips(),
    });

    for (let i = n; i > 0; i--) {
      const wi = weights[i - 1] ?? 0;
      const vi = values[i - 1] ?? 0;
      const name = nameOf(i - 1);
      const here = table.read(i, w);
      const up = table.read(i - 1, w);
      table.countComparison();
      const from = w;
      if (here !== up) {
        taken.unshift({ id: name, label: `${name} ${wi}/${vi}` });
        carried += wi;
        w -= wi;
      }
      table.walk(i - 1, w);
      const tookIt = from !== w;
      yield scene.frame({
        codeLine: tookIt ? LINE.take : LINE.test,
        phase: 'traceback',
        explanation: tookIt
          ? `T[${i}][${from}] = ${here} beats ${up} above it, so ${name} was taken. Step up and left by its weight ${wi}, to capacity ${w}.`
          : `T[${i}][${from}] = ${here}, the same as above it, so ${name} was skipped. Step straight up.`,
        highlights: { active: [t(i - 1, w)], ...(tookIt ? { candidate: [`output:${name}`] } : { excluded: [paneRef(TABLE, rowRef(i))] }) },
        pointers: { i: paneRef(TABLE, rowRef(i - 1)), w: paneRef(TABLE, colRef(w)) },
        arrows: { [TABLE]: [{ from: { row: i - 1, col: w }, to: { row: i, col: from }, label: tookIt ? 'take' : 'skip' }] },
        strips: strips(),
      });
    }

    yield scene.frame({
      codeLine: LINE.ret,
      phase: 'done',
      explanation:
        taken.length === 0
          ? `Nothing fits, so the best value is 0.`
          : `Take ${taken.map((item) => item.id).join(', ')}: weight ${carried} of ${capacity}, value ${best}. No other choice of items that fits is worth more.`,
      highlights: { candidate: taken.map((item) => `output:${item.id}`), sorted: [d(capacity)] },
      strips: strips(),
    });
  },
});
