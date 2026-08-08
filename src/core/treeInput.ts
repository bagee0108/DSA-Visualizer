/**
 * Input plumbing shared by the tree algorithms: an initial key list plus a
 * tiny operations language, so one text field can drive insert / delete /
 * search sequences without a bespoke form per algorithm.
 */

import type { FieldSpec, ParamMap, ParseResult, PresetSpec } from './define';
import { parseNumberList } from './arrayInput';
import { randomInt, shuffle } from './random';

export type KeyOpKind = 'insert' | 'delete' | 'search';

export interface KeyOp {
  readonly kind: KeyOpKind;
  readonly key: number;
}

const SHORTHAND: Record<string, KeyOpKind> = { '+': 'insert', '-': 'delete', '?': 'search' };

export function parseKeyOps(raw: string, allowed: readonly KeyOpKind[]): ParseResult<KeyOp[]> {
  const ops: KeyOp[] = [];
  const tokens = raw
    .split(/[;\n,]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  for (const token of tokens) {
    let kind: KeyOpKind | undefined;
    let rest: string;

    const symbol = token[0] ?? '';
    if (symbol in SHORTHAND) {
      kind = SHORTHAND[symbol];
      rest = token.slice(1).trim();
    } else {
      const match = /^([a-z]+)\s+(.+)$/i.exec(token);
      if (match === null) return { ok: false, error: `Cannot read operation "${token}". Use "insert 5", "delete 5", "search 5" or +5 / -5 / ?5.` };
      const word = (match[1] ?? '').toLowerCase();
      kind = word.startsWith('ins') ? 'insert' : word.startsWith('del') || word.startsWith('rem') ? 'delete' : word.startsWith('sea') || word.startsWith('find') ? 'search' : undefined;
      rest = match[2] ?? '';
    }

    if (kind === undefined) return { ok: false, error: `Unknown operation in "${token}".` };
    if (!allowed.includes(kind)) return { ok: false, error: `"${kind}" is not supported by this algorithm.` };

    const key = Number(rest);
    if (!Number.isFinite(key)) return { ok: false, error: `"${rest}" is not a number in "${token}".` };
    ops.push({ kind, key });
  }

  return { ok: true, value: ops };
}

export function formatKeyOps(ops: readonly KeyOp[]): string {
  return ops.map((op) => `${op.kind} ${op.key}`).join('; ');
}

export const keysField: FieldSpec = {
  key: 'input',
  label: 'Initial keys',
  kind: 'numbers',
  defaultValue: '50, 30, 70, 20, 40, 60, 80, 35, 45, 65',
  placeholder: '50, 30, 70',
  help: 'Inserted in this order to build the starting tree.',
};

export function opsField(defaultValue: string, allowed: readonly KeyOpKind[]): FieldSpec {
  const verbs = allowed.join(' / ');
  return {
    key: 'ops',
    label: 'Operations',
    kind: 'text',
    defaultValue,
    placeholder: 'insert 42; delete 30; search 65',
    help: `${verbs}, separated by ; or newlines. Shorthand: +42 -30 ?65`,
  };
}

export function parseTreeKeys(raw: string, maxLength = 60): ParseResult<number[]> {
  const parsed = parseNumberList(raw, { label: 'Initial keys', maxLength, minLength: 0 });
  if (!parsed.ok) return parsed;
  const seen = new Set<number>();
  for (const key of parsed.value) {
    if (seen.has(key)) return { ok: false, error: `Duplicate key ${key}. Tree keys must be distinct.` };
    seen.add(key);
  }
  return parsed;
}

export function distinctKeys(size: number, rng: () => number, low = 1, high = 99): number[] {
  const pool = Array.from({ length: high - low + 1 }, (_, index) => low + index);
  shuffle(pool, rng);
  return pool.slice(0, size);
}

export function medianFirst(sorted: readonly number[]): number[] {
  const order: number[] = [];
  const queue: Array<[number, number]> = [[0, sorted.length - 1]];
  while (queue.length > 0) {
    const range = queue.shift();
    if (range === undefined) break;
    const [lo, hi] = range;
    if (lo > hi) continue;
    const mid = (lo + hi) >> 1;
    const key = sorted[mid];
    if (key !== undefined) order.push(key);
    queue.push([lo, mid - 1], [mid + 1, hi]);
  }
  return order;
}

function pickOps(keys: readonly number[], rng: () => number, allowed: readonly KeyOpKind[]): string {
  const ops: string[] = [];
  const present = [...keys];
  if (allowed.includes('insert')) {
    for (let k = 0; k < 2; k++) {
      let candidate = randomInt(rng, 1, 99);
      while (present.includes(candidate)) candidate = randomInt(rng, 1, 99);
      ops.push(`insert ${candidate}`);
      present.push(candidate);
    }
  }
  if (allowed.includes('search') && present.length > 0) {
    ops.push(`search ${present[randomInt(rng, 0, present.length - 1)] ?? 1}`);
  }
  if (allowed.includes('delete') && present.length > 0) {
    ops.push(`delete ${present[randomInt(rng, 0, present.length - 1)] ?? 1}`);
  }
  return ops.join('; ');
}

export function treePresets(allowed: readonly KeyOpKind[]): readonly PresetSpec[] {
  const toParams = (keys: number[], rng: () => number): ParamMap => ({
    input: keys.join(', '),
    ops: pickOps(keys, rng, allowed),
    seed: String(randomInt(rng, 0, 999999)),
  });
  return [
    { id: 'random', label: 'Random', build: (size, rng) => toParams(distinctKeys(size, rng), rng) },
    {
      id: 'sorted',
      label: 'Sorted (degenerate)',
      build: (size, rng) => toParams(distinctKeys(size, rng).sort((a, b) => a - b), rng),
    },
    {
      id: 'balanced',
      label: 'Balanced order',
      build: (size, rng) => toParams(medianFirst(distinctKeys(size, rng).sort((a, b) => a - b)), rng),
    },
  ];
}
