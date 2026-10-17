/**
 * Fenwick tree (binary indexed tree) over sums. Drawn as the classic
 * staircase: tree[i] sits in column i, on the row of its range length,
 * lowbit(i), so every lowbit jump is an arrow between steps.
 */

import { parseNumberList } from '../../core/arrayInput';
import { defineAlgorithm, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
import { cellRef, colRef, MatrixScene } from '../../core/matrixScene';
import { randomInt } from '../../core/random';
import type { EntityId, MatrixArrow, Strip, StripItem } from '../../core/types';

export const MAX_SIZE = 16;
export const MAX_OPS = 6;
const MAX_ABS_VALUE = 99;

export type FenwickOp =
  | { readonly kind: 'sum'; readonly to: number }
  | { readonly kind: 'range'; readonly from: number; readonly to: number }
  | { readonly kind: 'add'; readonly index: number; readonly delta: number };

interface FenwickInput {
  readonly values: readonly number[];
  readonly ops: readonly FenwickOp[];
}

const CODE = `function lowbit(i: number): number {
  return i & -i;                           // the lowest set bit of i
}

function build(a: number[]): number[] {    // a and tree are 1-indexed
  const tree = [...a];
  for (let i = 1; i < tree.length; i++) {
    const parent = i + lowbit(i);
    if (parent < tree.length) tree[parent] += tree[i];   // pass the total up
  }
  return tree;
}

function add(tree: number[], i: number, delta: number): void {
  for (; i < tree.length; i += lowbit(i)) {
    tree[i] += delta;                      // every range that contains i
  }
}

function prefix(tree: number[], i: number): number {
  let sum = 0;
  for (; i > 0; i -= lowbit(i)) {
    sum += tree[i];                        // tree[i] covers (i - lowbit(i), i]
  }
  return sum;                              // a[l..r] = prefix(r) - prefix(l - 1)
}`;

export const LINE = {
  copy: 6,
  parent: 8,
  pass: 9,
  add: 14,
  addStep: 16,
  prefix: 20,
  prefixStep: 23,
  ret: 25,
} as const;

export const JUMPS = 'lowbit jumps';

export function lowbit(i: number): number {
  return i & -i;
}

export function formatOp(op: FenwickOp): string {
  if (op.kind === 'sum') return `sum ${op.to}`;
  if (op.kind === 'range') return `range ${op.from} ${op.to}`;
  return `add ${op.index} ${op.delta}`;
}

/** "sum 6; add 3 2; range 2 7", 1-indexed, separated by ; or newlines. */
export function parseOps(raw: string, size: number): ParseResult<FenwickOp[]> {
  const ops: FenwickOp[] = [];
  const tokens = raw
    .split(/[;\n]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length > MAX_OPS) return { ok: false, error: `At most ${MAX_OPS} operations (got ${tokens.length}).` };

  const inside = (i: number): boolean => i >= 1 && i <= size;
  for (const token of tokens) {
    const words = token.split(/[\s,]+/);
    const verb = (words[0] ?? '').toLowerCase();
    const numbers = words.slice(1).map(Number);
    if (numbers.some((value) => !Number.isInteger(value))) return { ok: false, error: `"${token}" takes whole numbers.` };
    const [x = NaN, y = NaN] = numbers;
    if (verb === 'sum' && numbers.length === 1) {
      if (!inside(x)) return { ok: false, error: `"${token}": i must be within 1..${size}.` };
      ops.push({ kind: 'sum', to: x });
    } else if (verb === 'range' && numbers.length === 2) {
      if (!inside(x) || !inside(y) || x > y) return { ok: false, error: `"${token}" needs 1 <= l <= r <= ${size}.` };
      ops.push({ kind: 'range', from: x, to: y });
    } else if (verb === 'add' && numbers.length === 2) {
      if (!inside(x)) return { ok: false, error: `"${token}": i must be within 1..${size}.` };
      if (Math.abs(y) > MAX_ABS_VALUE) return { ok: false, error: `"${token}": keep the change within -${MAX_ABS_VALUE}..${MAX_ABS_VALUE}.` };
      ops.push({ kind: 'add', index: x, delta: y });
    } else {
      return { ok: false, error: `Cannot read "${token}". Use "sum 6" for a[1..6], "range 2 7" for a[2..7] or "add 3 2" for a[3] += 2.` };
    }
  }
  return { ok: true, value: ops };
}

const presets: readonly PresetSpec[] = [
  {
    id: 'random',
    label: 'Random',
    build: (size, rng) => {
      const from = randomInt(rng, 1, size);
      return {
        input: Array.from({ length: size }, () => randomInt(rng, 1, 9)).join(', '),
        ops: `sum ${randomInt(rng, 1, size)}; add ${randomInt(rng, 1, size)} ${randomInt(rng, 1, 5)}; range ${from} ${randomInt(rng, from, size)}`,
      };
    },
  },
  {
    id: 'ones',
    label: 'All ones',
    build: (size) => ({
      input: Array.from({ length: size }, () => 1).join(', '),
      ops: `sum ${size}; add 1 1; sum ${size}`,
    }),
  },
  {
    id: 'worst',
    label: 'Most jumps',
    build: (size, rng) => {
      // 2^k - 1 is all ones in binary, so the prefix sum jumps once per bit.
      let all = 1;
      while (all * 2 + 1 <= size) all = all * 2 + 1;
      return { input: Array.from({ length: size }, () => randomInt(rng, 1, 9)).join(', '), ops: `sum ${all}; add 1 1` };
    },
  },
];

function parse(params: ParamMap): ParseResult<FenwickInput> {
  const values = parseNumberList(params.input ?? '', { label: 'Array', maxLength: MAX_SIZE });
  if (!values.ok) return values;
  if (values.value.length < 2) return { ok: false, error: 'A Fenwick tree needs at least 2 elements.' };
  const odd = values.value.find((value) => !Number.isInteger(value) || Math.abs(value) > MAX_ABS_VALUE);
  if (odd !== undefined) return { ok: false, error: `Values are whole numbers within -${MAX_ABS_VALUE}..${MAX_ABS_VALUE} (got ${odd}).` };
  const ops = parseOps(params.ops ?? '', values.value.length);
  if (!ops.ok) return ops;
  return { ok: true, value: { values: values.value, ops: ops.value } };
}

export const fenwick = defineAlgorithm<FenwickInput>({
  meta: {
    id: 'fenwick',
    name: 'Fenwick tree (BIT)',
    category: 'trees',
    structureKind: 'matrix',
    blurb: 'Prefix sums driven by the lowbit jumps, shown in binary.',
    complexity: {
      time: { best: 'O(1)', average: 'O(log n)', worst: 'O(log n)' },
      space: 'O(n)',
      notes: [
        'tree[i] holds the sum of the lowbit(i) elements ending at i. Taking lowbit off i clears its lowest 1 bit, so a prefix sum takes one jump per 1 bit of i.',
        'An update adds lowbit instead, carrying i up to the next range that contains it; at most log n of them do.',
        'No pointers and no extra nodes: the tree is the array itself, which is why it is the usual choice when you only need prefix sums.',
      ],
    },
    code: CODE,
    trackedCounters: ['reads', 'writes'],
  },
  fields: [
    {
      key: 'input',
      label: 'Array',
      kind: 'numbers',
      defaultValue: '3, 2, 5, 1, 4, 6, 2, 7, 1, 3',
      placeholder: '3, 2, 5, 1',
      help: `2 to ${MAX_SIZE} whole numbers, read as a[1], a[2], ...`,
    },
    {
      key: 'ops',
      label: 'Operations',
      kind: 'text',
      defaultValue: 'sum 7; add 3 4; range 3 10',
      placeholder: 'sum 7; add 3 4',
      help: `Up to ${MAX_OPS}, 1-indexed, separated by ;. "sum i", "range l r", "add i d".`,
    },
  ],
  presets,
  sizeRange: { min: 2, max: MAX_SIZE, step: 1 },
  parse,
  *run({ values, ops }) {
    const n = values.length;
    const bits = n.toString(2).length;
    const binary = (i: number): string => i.toString(2).padStart(bits, '0');
    const levels = Math.floor(Math.log2(n)) + 1;
    const rowOf = (i: number): number => levels - 1 - Math.log2(lowbit(i));
    const aRow = levels;
    const col = (i: number): number => i - 1;
    const tree = (i: number): string => cellRef(rowOf(i), col(i));
    const covered = (i: number): EntityId[] => {
      const out: EntityId[] = [];
      for (let k = i - lowbit(i) + 1; k <= i; k++) out.push(cellRef(aRow, col(k)));
      return out;
    };
    const span = (i: number): string => (lowbit(i) === 1 ? `a[${i}]` : `a[${i - lowbit(i) + 1}..${i}]`);
    const jump = (from: number, to: number, label: string): MatrixArrow => ({
      from: { row: rowOf(from), col: col(from) },
      to: { row: rowOf(to), col: col(to) },
      label,
    });

    const scene = new MatrixScene({
      rowHeaders: [...Array.from({ length: levels }, (_, row) => `len ${2 ** (levels - 1 - row)}`), 'a'],
      colHeaders: Array.from({ length: n }, (_, at) => binary(at + 1)),
      rowTitle: 'tree[i], by range length',
      colTitle: 'i in binary',
    });
    const cells: number[] = [0, ...values];
    const sums: number[] = [0, ...values];

    let pending: StripItem[] = ops.map((op, at) => ({ id: `op${at}`, label: formatOp(op) }));
    let terms: StripItem[] = [];
    const strips = (): readonly Strip[] => [
      { kind: 'queue', label: 'ops', items: pending },
      { kind: 'output', label: 'sum', items: terms },
    ];

    // Build: copy, then each tree[i] passes its total up to i + lowbit(i).
    for (let i = 1; i <= n; i++) {
      scene.write(aRow, col(i), cells[i] ?? 0);
      scene.write(rowOf(i), col(i), sums[i] ?? 0);
    }
    yield scene.frame({
      codeLine: LINE.copy,
      phase: 'build',
      explanation: `Start with tree = a. Column i is headed by i in binary, and tree[i] sits on the row of lowbit(i), the lowest 1 bit of i: the length of the range ending at i that it will sum.`,
      strips: strips(),
    });

    for (let i = 1; i <= n; i++) {
      const parent = i + lowbit(i);
      if (parent > n) {
        yield scene.frame({
          codeLine: LINE.parent,
          phase: 'build',
          explanation: `i = ${binary(i)}: ${i} + lowbit ${lowbit(i)} = ${parent} is past the end, so tree[${i}] has no range above it. It holds the sum of ${span(i)}.`,
          highlights: { active: [tree(i)], visited: covered(i) },
          pointers: { i: colRef(col(i)) },
          strips: strips(),
        });
        continue;
      }
      const passed = scene.read(rowOf(i), col(i));
      const before = scene.read(rowOf(parent), col(parent));
      sums[parent] = before + passed;
      scene.write(rowOf(parent), col(parent), before + passed);
      scene.bump(JUMPS);
      yield scene.frame({
        codeLine: LINE.pass,
        phase: 'build',
        explanation: `tree[${i}] is complete: the sum of ${span(i)}. ${binary(i)} + ${binary(lowbit(i))} = ${binary(parent)}, so pass it up: tree[${parent}] = ${before} + ${passed} = ${before + passed}.`,
        highlights: { active: [tree(parent)], comparing: [tree(i)], visited: covered(i) },
        pointers: { i: colRef(col(i)) },
        arrows: [jump(i, parent, `+${lowbit(i)}`)],
        strips: strips(),
      });
    }

    function* prefix(to: number, label: string): Generator<ReturnType<MatrixScene['frame']>, number, undefined> {
      let sum = 0;
      const taken: EntityId[] = [];
      const ranges: EntityId[] = [];
      for (let i = to; i > 0; i -= lowbit(i)) {
        const value = scene.read(rowOf(i), col(i));
        sum += value;
        taken.push(tree(i));
        ranges.push(...covered(i));
        scene.walk(rowOf(i), col(i));
        terms = [...terms, { id: `${label}:${i}`, label: `${span(i)} ${value}` }];
        const next = i - lowbit(i);
        if (next > 0) scene.bump(JUMPS);
        yield scene.frame({
          codeLine: LINE.prefixStep,
          phase: 'query',
          explanation:
            next > 0
              ? `i = ${binary(i)}: tree[${i}] covers ${span(i)}, add ${value} (sum ${sum}). Clear the lowest 1 bit: ${binary(i)} - ${binary(lowbit(i))} = ${binary(next)}, so i = ${next}.`
              : `i = ${binary(i)}: tree[${i}] covers ${span(i)}, add ${value}. Clearing its last 1 bit leaves 0, so the prefix sum of a[1..${to}] is ${sum}.`,
          highlights: { comparing: [tree(i)], sorted: taken.slice(0, -1), visited: [...ranges] },
          pointers: { i: colRef(col(i)) },
          arrows: next > 0 ? [jump(i, next, `-${lowbit(i)}`)] : [],
          strips: strips(),
        });
      }
      return sum;
    }

    let summary = `Built in one pass: each tree[i] passed its total to tree[i + lowbit(i)].`;
    for (const op of ops) {
      pending = pending.slice(1);
      terms = [];
      scene.clearPath();

      if (op.kind === 'add') {
        yield scene.frame({
          codeLine: LINE.add,
          phase: 'update',
          explanation: `${formatOp(op)}: a[${op.index}] changes by ${op.delta}. Every tree[i] whose range contains ${op.index} must change too; adding lowbit walks exactly those.`,
          pointers: { i: colRef(col(op.index)) },
          strips: strips(),
        });
        scene.write(aRow, col(op.index), (scene.peek(aRow, col(op.index)) ?? 0) + op.delta);
        const touched: EntityId[] = [];
        for (let i = op.index; i <= n; i += lowbit(i)) {
          const before = scene.read(rowOf(i), col(i));
          scene.write(rowOf(i), col(i), before + op.delta);
          scene.walk(rowOf(i), col(i));
          touched.push(tree(i));
          const next = i + lowbit(i);
          if (next <= n) scene.bump(JUMPS);
          yield scene.frame({
            codeLine: LINE.addStep,
            phase: 'update',
            explanation:
              next <= n
                ? `tree[${i}] covers ${span(i)}, which contains ${op.index}: ${before} becomes ${before + op.delta}. Add the lowest 1 bit: ${binary(i)} + ${binary(lowbit(i))} = ${binary(next)}, so i = ${next}.`
                : `tree[${i}] covers ${span(i)}: ${before} becomes ${before + op.delta}. ${i} + ${lowbit(i)} = ${next} is past the end, so the update is done after ${touched.length} cell${touched.length === 1 ? '' : 's'}.`,
            highlights: { active: [tree(i)], sorted: touched.slice(0, -1), visited: covered(i), candidate: [cellRef(aRow, col(op.index))] },
            pointers: { i: colRef(col(i)) },
            arrows: next <= n ? [jump(i, next, `+${lowbit(i)}`)] : [],
            strips: strips(),
          });
        }
        summary = `a[${op.index}] changed by ${op.delta}, touching ${touched.length} of ${n} cells.`;
        continue;
      }

      const from = op.kind === 'range' ? op.from : 1;
      yield scene.frame({
        codeLine: LINE.prefix,
        phase: 'query',
        explanation:
          op.kind === 'range'
            ? `${formatOp(op)}: a[${from}..${op.to}] is prefix(${op.to}) - prefix(${from - 1}). Each prefix walks i down by its lowest 1 bit.`
            : `${formatOp(op)}: the sum of a[1..${op.to}]. Start at i = ${op.to} = ${binary(op.to)} and take one range per 1 bit.`,
        pointers: { i: colRef(col(op.to)) },
        strips: strips(),
      });
      const high = yield* prefix(op.to, 'hi');
      let result = high;
      if (op.kind === 'range' && from > 1) {
        scene.clearPath();
        const low = yield* prefix(from - 1, 'lo');
        result = high - low;
      }
      summary =
        op.kind === 'range'
          ? `sum of a[${from}..${op.to}] = ${result}${from > 1 ? ` = prefix(${op.to}) - prefix(${from - 1})` : ''}.`
          : `sum of a[1..${op.to}] = ${result}, from ${terms.length} range${terms.length === 1 ? '' : 's'}: one per 1 bit of ${binary(op.to)}.`;
      yield scene.frame({
        codeLine: LINE.ret,
        phase: 'query',
        explanation: summary,
        strips: strips(),
      });
    }

    scene.clearPath();
    yield scene.frame({
      codeLine: 0,
      phase: 'done',
      explanation: ops.length === 0 ? summary : `Done. ${summary}`,
      strips: strips(),
    });
  },
});
