/** Segment tree over sums: build, point update and range query, with the recursion animated. */

import { parseNumberList } from '../../core/arrayInput';
import { defineAlgorithm, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
import { randomInt } from '../../core/random';
import { LEFT, RIGHT, TreeScene, type Side } from '../../core/treeScene';
import type { EntityId, Frame, Highlights, Strip, StripItem } from '../../core/types';
import { stepIds } from '../../core/steps';

export const MAX_LEAVES = 16;
export const MAX_OPS = 6;
/** Keeps every node's sum short enough to sit inside its circle. */
const MAX_ABS_VALUE = 99;

export type SegmentOp =
  | { readonly kind: 'sum'; readonly from: number; readonly to: number }
  | { readonly kind: 'set'; readonly index: number; readonly value: number };

interface SegmentInput {
  readonly values: readonly number[];
  readonly ops: readonly SegmentOp[];
}

const CODE = `const tree: number[] = [];                   // tree[node]: the sum of its range

function build(a: number[], node: number, l: number, r: number): void {
  if (l === r) {
    tree[node] = a[l];                          // a leaf holds one element
    return;
  }
  const mid = (l + r) >> 1;
  build(a, 2 * node, l, mid);
  build(a, 2 * node + 1, mid + 1, r);
  tree[node] = tree[2 * node] + tree[2 * node + 1];
}

function update(node: number, l: number, r: number, i: number, value: number): void {
  if (l === r) {
    tree[node] = value;                         // the leaf for a[i]
    return;
  }
  const mid = (l + r) >> 1;
  if (i <= mid) update(2 * node, l, mid, i, value);
  else update(2 * node + 1, mid + 1, r, i, value);
  tree[node] = tree[2 * node] + tree[2 * node + 1];   // refresh on the way up
}

function query(node: number, l: number, r: number, ql: number, qr: number): number {
  if (qr < l || r < ql) return 0;               // disjoint: contributes nothing
  if (ql <= l && r <= qr) return tree[node];    // covered: take it whole
  const mid = (l + r) >> 1;                     // partial: ask both halves
  return query(2 * node, l, mid, ql, qr) + query(2 * node + 1, mid + 1, r, ql, qr);
}`;

export const LINE = {
  build: 3,
  leaf: 5,
  split: 8,
  combine: 11,
  update: 14,
  setLeaf: 16,
  goLeft: 20,
  goRight: 21,
  refresh: 22,
  query: 25,
  disjoint: 26,
  covered: 27,
  partial: 28,
  sum: 29,
} as const;
export const STEP = stepIds(LINE);

export const VISITED = 'nodes visited';

export function formatOp(op: SegmentOp): string {
  return op.kind === 'sum' ? `sum ${op.from} ${op.to}` : `set ${op.index} ${op.value}`;
}

/** "sum 2 5; set 3 9", separated by ; or newlines. "query" and "update" read the same. */
export function parseOps(raw: string, size: number): ParseResult<SegmentOp[]> {
  const ops: SegmentOp[] = [];
  const tokens = raw
    .split(/[;\n]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length > MAX_OPS) return { ok: false, error: `At most ${MAX_OPS} operations (got ${tokens.length}).` };

  for (const token of tokens) {
    const match = /^([a-z]+)\s+(-?\d+)[\s,]+(-?\d+)$/i.exec(token);
    if (match === null) return { ok: false, error: `Cannot read "${token}". Use "sum 2 5" for a[2..5] or "set 3 9" for a[3] = 9.` };
    const word = (match[1] ?? '').toLowerCase();
    const x = Number(match[2]);
    const y = Number(match[3]);
    if (word === 'sum' || word === 'query') {
      if (x < 0 || y >= size || x > y) return { ok: false, error: `"${token}" needs 0 <= from <= to <= ${size - 1}.` };
      ops.push({ kind: 'sum', from: x, to: y });
    } else if (word === 'set' || word === 'update') {
      if (x < 0 || x >= size) return { ok: false, error: `"${token}": index ${x} is outside 0..${size - 1}.` };
      if (Math.abs(y) > MAX_ABS_VALUE) return { ok: false, error: `"${token}": values are kept within -${MAX_ABS_VALUE}..${MAX_ABS_VALUE}.` };
      ops.push({ kind: 'set', index: x, value: y });
    } else {
      return { ok: false, error: `Unknown operation "${match[1]}" in "${token}". Use sum or set.` };
    }
  }
  return { ok: true, value: ops };
}

function randomOps(size: number, rng: () => number): string {
  const ops: string[] = [];
  for (let at = 0; at < 3; at++) {
    if (at === 1) {
      ops.push(`set ${randomInt(rng, 0, size - 1)} ${randomInt(rng, 1, 9)}`);
    } else {
      const from = randomInt(rng, 0, size - 1);
      ops.push(`sum ${from} ${randomInt(rng, from, size - 1)}`);
    }
  }
  return ops.join('; ');
}

const presets: readonly PresetSpec[] = [
  {
    id: 'random',
    label: 'Random',
    build: (size, rng) => ({
      input: Array.from({ length: size }, () => randomInt(rng, 1, 9)).join(', '),
      ops: randomOps(size, rng),
    }),
  },
  {
    id: 'whole',
    label: 'Whole range',
    build: (size, rng) => ({
      input: Array.from({ length: size }, () => randomInt(rng, 1, 9)).join(', '),
      ops: `sum 0 ${size - 1}; sum 1 ${size - 2 < 1 ? size - 1 : size - 2}`,
    }),
  },
  {
    id: 'ones',
    label: 'All ones',
    build: (size) => ({
      input: Array.from({ length: size }, () => 1).join(', '),
      ops: `sum 0 ${Math.floor((size - 1) / 2)}; set 0 5; sum 0 ${size - 1}`,
    }),
  },
];

function parse(params: ParamMap): ParseResult<SegmentInput> {
  const values = parseNumberList(params.input ?? '', { label: 'Array', maxLength: MAX_LEAVES });
  if (!values.ok) return values;
  if (values.value.length < 2) return { ok: false, error: 'A segment tree needs at least 2 elements.' };
  const odd = values.value.find((value) => !Number.isInteger(value) || Math.abs(value) > MAX_ABS_VALUE);
  if (odd !== undefined) return { ok: false, error: `Values are whole numbers within -${MAX_ABS_VALUE}..${MAX_ABS_VALUE} (got ${odd}).` };
  const ops = parseOps(params.ops ?? '', values.value.length);
  if (!ops.ok) return ops;
  return { ok: true, value: { values: values.value, ops: ops.value } };
}

const span = (l: number, r: number): string => (l === r ? `[${l}]` : `[${l}..${r}]`);

export const segmentTree = defineAlgorithm<SegmentInput>({
  meta: {
    id: 'segment-tree',
    name: 'Segment tree',
    category: 'trees',
    structureKind: 'tree',
    blurb: 'Build, point update and range query with the recursion animated.',
    complexity: {
      time: { best: 'O(log n)', average: 'O(log n)', worst: 'O(log n)' },
      space: 'O(n)',
      notes: [
        'Build is O(n): every node is computed once, from its two children.',
        'A query visits at most four nodes per level: on each level only the two nodes holding the query\'s ends can be partial, so the work is O(log n) however wide the range.',
        'An update changes one leaf and the log n ranges above it, nothing else. Swap + for min, max or gcd and the shape stays the same.',
      ],
    },
    code: CODE,
    stepLines: LINE,
    trackedCounters: ['recursiveCalls', 'reads', 'writes'],
  },
  fields: [
    {
      key: 'input',
      label: 'Array',
      kind: 'numbers',
      defaultValue: '5, 8, 6, 3, 2, 7, 2, 6',
      placeholder: '5, 8, 6, 3',
      help: `2 to ${MAX_LEAVES} whole numbers; they become the leaves.`,
    },
    {
      key: 'ops',
      label: 'Operations',
      kind: 'text',
      defaultValue: 'sum 2 6; set 3 9; sum 2 6',
      placeholder: 'sum 2 6; set 3 9',
      help: `Up to ${MAX_OPS}, separated by ;. "sum l r" adds a[l..r]; "set i v" makes a[i] = v.`,
    },
  ],
  presets,
  sizeRange: { min: 2, max: MAX_LEAVES, step: 1 },
  parse,
  *run({ values, ops }) {
    const n = values.length;
    const scene = new TreeScene('nary');
    const byRange = new Map<string, string>();
    const idOf = (l: number, r: number): string => byRange.get(`${l}:${r}`) ?? '';

    let pending = ops.map((op, at) => ({ id: `op${at}`, label: formatOp(op) }));
    let taken: StripItem[] = [];
    const strips = (): readonly Strip[] => [
      { kind: 'queue', label: 'ops', items: pending },
      { kind: 'output', label: 'taken', items: taken },
    ];

    // Build ---------------------------------------------------------------
    function* build(l: number, r: number, parent: string | null, side: Side): Generator<Frame, number, undefined> {
      const id = scene.create('?', { badges: { '': span(l, r) } });
      byRange.set(`${l}:${r}`, id);
      if (parent === null) scene.setRoot(id);
      else scene.link(parent, side, id);
      scene.countCall();
      scene.pushCall({ label: `build ${span(l, r)}`, step: STEP.build });

      if (l === r) {
        const value = values[l] ?? 0;
        scene.setValue(id, value);
        yield scene.frame({
          step: STEP.leaf,
          phase: 'build',
          explanation: `${span(l, r)} is a single element: the leaf holds a[${l}] = ${value}.`,
          highlights: { active: [id] },
          strips: strips(),
        });
        scene.popCall();
        return value;
      }

      const mid = (l + r) >> 1;
      yield scene.frame({
        step: STEP.split,
        phase: 'build',
        explanation: `${span(l, r)} splits at mid = ${mid} into ${span(l, mid)} and ${span(mid + 1, r)}. Build both, then add.`,
        highlights: { active: [id] },
        strips: strips(),
      });
      const left = yield* build(l, mid, id, LEFT);
      const right = yield* build(mid + 1, r, id, RIGHT);
      scene.setValue(id, left + right);
      yield scene.frame({
        step: STEP.combine,
        phase: 'build',
        explanation: `Both halves are ready: ${span(l, r)} = ${left} + ${right} = ${left + right}.`,
        highlights: { active: [id], visited: [idOf(l, mid), idOf(mid + 1, r)] },
        strips: strips(),
      });
      scene.popCall();
      return left + right;
    }

    yield scene.frame({
      step: STEP.build,
      phase: 'build',
      explanation: `Each node will hold the sum of a range of the ${n} elements, written beside it; the root covers ${span(0, n - 1)}, and each node splits its range in half for its children.`,
      strips: strips(),
    });
    const total = yield* build(0, n - 1, null, LEFT);

    // Update --------------------------------------------------------------
    function* update(l: number, r: number, index: number, value: number, path: string[]): Generator<Frame, number, undefined> {
      const id = idOf(l, r);
      scene.countCall();
      scene.pushCall({ label: `update ${span(l, r)}`, step: STEP.update });
      path.push(id);

      if (l === r) {
        const before = scene.value(id);
        scene.setValue(id, value);
        yield scene.frame({
          step: STEP.setLeaf,
          phase: 'update',
          explanation: `The leaf for a[${index}]: ${before} becomes ${value}. Only the ranges above it contain a[${index}], so only they change.`,
          highlights: { candidate: [id], visited: path.slice(0, -1) },
          strips: strips(),
        });
        scene.popCall();
        return value;
      }

      const mid = (l + r) >> 1;
      const goLeft = index <= mid;
      yield scene.frame({
        step: goLeft ? STEP.goLeft : STEP.goRight,
        phase: 'update',
        explanation: `${index} ${goLeft ? `<= ${mid}` : `> ${mid}`}, so a[${index}] lives in the ${goLeft ? 'left' : 'right'} half, ${goLeft ? span(l, mid) : span(mid + 1, r)}. The other half is untouched.`,
        highlights: { active: [id], visited: path.slice(0, -1) },
        strips: strips(),
      });
      if (goLeft) yield* update(l, mid, index, value, path);
      else yield* update(mid + 1, r, index, value, path);

      const left = scene.visit(idOf(l, mid)).value;
      const right = scene.visit(idOf(mid + 1, r)).value;
      const before = scene.value(id);
      scene.setValue(id, left + right);
      path.pop();
      yield scene.frame({
        step: STEP.refresh,
        phase: 'update',
        explanation: `Back up at ${span(l, r)}: ${left} + ${right} = ${left + right}${before === left + right ? ', unchanged' : ` (was ${before})`}.`,
        highlights: { active: [id], visited: [idOf(l, mid), idOf(mid + 1, r)] },
        strips: strips(),
      });
      scene.popCall();
      return left + right;
    }

    // Query ---------------------------------------------------------------
    function* query(l: number, r: number, from: number, to: number, seen: Seen): Generator<Frame, number, undefined> {
      const id = idOf(l, r);
      scene.countCall();
      scene.bump(VISITED);
      seen.visits += 1;
      scene.pushCall({ label: `query ${span(l, r)}`, step: STEP.query });
      const look = (extra: Highlights): Highlights => ({
        sorted: [...seen.covered],
        excluded: [...seen.disjoint],
        visited: [...seen.partial],
        ...extra,
      });

      if (to < l || r < from) {
        seen.disjoint.push(id);
        yield scene.frame({
          step: STEP.disjoint,
          phase: 'query',
          explanation: `${span(l, r)} does not overlap ${span(from, to)}: it contributes 0, and nothing below it is visited.`,
          highlights: look({}),
          strips: strips(),
        });
        scene.popCall();
        return 0;
      }

      if (from <= l && r <= to) {
        const value = scene.visit(id).value;
        seen.covered.push(id);
        taken = [...taken, { id: `take:${id}`, label: `${span(l, r)} ${value}` }];
        yield scene.frame({
          step: STEP.covered,
          phase: 'query',
          explanation: `${span(l, r)} lies wholly inside ${span(from, to)}, so take its sum, ${value}, without going further down.`,
          highlights: look({ active: [id] }),
          strips: strips(),
        });
        scene.popCall();
        return value;
      }

      seen.partial.push(id);
      const mid = (l + r) >> 1;
      yield scene.frame({
        step: STEP.partial,
        phase: 'query',
        explanation: `${span(l, r)} only partly overlaps ${span(from, to)}, so ask both halves.`,
        highlights: look({ active: [id] }),
        strips: strips(),
      });
      const left = yield* query(l, mid, from, to, seen);
      const right = yield* query(mid + 1, r, from, to, seen);
      yield scene.frame({
        step: STEP.sum,
        phase: 'query',
        explanation: `${span(l, r)} returns ${left} + ${right} = ${left + right}.`,
        highlights: look({ active: [id] }),
        strips: strips(),
      });
      scene.popCall();
      return left + right;
    }

    let summary = `Built: the root holds the total, ${total}.`;
    for (const op of ops) {
      pending = pending.slice(1);
      taken = [];
      if (op.kind === 'set') {
        yield scene.frame({
          step: STEP.update,
          phase: 'update',
          explanation: `${formatOp(op)}: walk from the root down to the leaf for a[${op.index}], then refresh every sum on the way back up.`,
          highlights: { active: [idOf(0, n - 1)] },
          strips: strips(),
        });
        yield* update(0, n - 1, op.index, op.value, []);
        summary = `a[${op.index}] is now ${op.value}; the root holds ${scene.value(idOf(0, n - 1))}.`;
      } else {
        yield scene.frame({
          step: STEP.query,
          phase: 'query',
          explanation: `${formatOp(op)}: the sum of a[${op.from}..${op.to}]. Start at the root and only go down where a range is cut by the query.`,
          highlights: { active: [idOf(0, n - 1)] },
          strips: strips(),
        });
        const seen: Seen = { covered: [], disjoint: [], partial: [], visits: 0 };
        const result = yield* query(0, n - 1, op.from, op.to, seen);
        summary = `sum of a[${op.from}..${op.to}] = ${result}, from ${seen.covered.length} whole range${seen.covered.length === 1 ? '' : 's'}; ${seen.visits} of ${scene.size} nodes visited.`;
        yield scene.frame({
          step: STEP.query,
          phase: 'query',
          explanation: summary,
          highlights: { sorted: seen.covered as EntityId[] },
          strips: strips(),
        });
      }
    }

    yield scene.frame({
      step: null,
      phase: 'done',
      explanation: ops.length === 0 ? summary : `Done. ${summary}`,
      strips: strips(),
    });
  },
});

interface Seen {
  readonly covered: string[];
  readonly disjoint: string[];
  readonly partial: string[];
  visits: number;
}
