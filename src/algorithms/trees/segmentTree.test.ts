import { describe, expect, it } from 'vitest';

import { makeRng, randomInt } from '../../core/random';
import type { Frame, TreeNodeSnapshot } from '../../core/types';
import { expectDeterministic, expectFrameHygiene, expectInputContract, lastFrame, runFrames, treeOf } from '../frameHygiene';
import { formatOp, MAX_LEAVES, parseOps, segmentTree, type SegmentOp, STEP } from './segmentTree';

const HYGIENE = { allowSizeChange: true } as const;

function solve(values: readonly number[], ops: readonly SegmentOp[]): readonly Frame[] {
  return runFrames(segmentTree, { input: values.join(', '), ops: ops.map(formatOp).join('; ') });
}

/** Query answers, read back from the summary frame each query ends with. */
function answersOf(frames: readonly Frame[]): number[] {
  return frames
    .filter((frame) => frame.step === STEP.query && frame.phase === 'query')
    .map((frame) => /= (-?\d+), from/.exec(frame.explanation)?.[1])
    .filter((answer): answer is string => answer !== undefined)
    .map(Number);
}

/** Every reference answer, by adding the slice; updates applied in order. */
function reference(values: readonly number[], ops: readonly SegmentOp[]): number[] {
  const a = [...values];
  const out: number[] = [];
  for (const op of ops) {
    if (op.kind === 'set') a[op.index] = op.value;
    else out.push(a.slice(op.from, op.to + 1).reduce((sum, value) => sum + value, 0));
  }
  return out;
}

function nodesById(frame: Frame): Map<string, TreeNodeSnapshot> {
  return new Map(treeOf(frame).nodes.map((node) => [node.id, node] as const));
}

/** Leaves, left to right, as the renderer lays them out. */
function leaves(frame: Frame): number[] {
  const byId = nodesById(frame);
  const out: number[] = [];
  const walk = (id: string): void => {
    const node = byId.get(id);
    if (node === undefined) return;
    const kids = node.children.filter((child): child is string => child !== null);
    if (kids.length === 0) out.push(Number(node.label));
    for (const child of kids) walk(child);
  };
  const root = treeOf(frame).rootId;
  if (root !== null) walk(root);
  return out;
}

function randomCase(rng: () => number): { values: number[]; ops: SegmentOp[] } {
  const n = randomInt(rng, 2, MAX_LEAVES);
  const values = Array.from({ length: n }, () => randomInt(rng, -20, 20));
  const ops: SegmentOp[] = Array.from({ length: randomInt(rng, 0, 6) }, () => {
    if (rng() < 0.4) return { kind: 'set', index: randomInt(rng, 0, n - 1), value: randomInt(rng, -20, 20) };
    const from = randomInt(rng, 0, n - 1);
    return { kind: 'sum', from, to: randomInt(rng, from, n - 1) };
  });
  return { values, ops };
}

describe('segment tree: correctness', () => {
  it('answers the default operations', () => {
    const values = [5, 8, 6, 3, 2, 7, 2, 6];
    const ops: SegmentOp[] = [
      { kind: 'sum', from: 2, to: 6 },
      { kind: 'set', index: 3, value: 9 },
      { kind: 'sum', from: 2, to: 6 },
    ];
    expect(answersOf(solve(values, ops))).toEqual([20, 26]);
  });

  it('agrees with adding the slice, across random arrays and operations', () => {
    const rng = makeRng(2718);
    for (let trial = 0; trial < 150; trial++) {
      const { values, ops } = randomCase(rng);
      const frames = solve(values, ops);
      expect(answersOf(frames), `${values.join(',')} | ${ops.map(formatOp).join('; ')}`).toEqual(reference(values, ops));
    }
  });

  it('keeps every finished node equal to the sum of its children, and the leaves equal to the array', () => {
    const rng = makeRng(31);
    for (let trial = 0; trial < 40; trial++) {
      const { values, ops } = randomCase(rng);
      const end = lastFrame(solve(values, ops));
      const byId = nodesById(end);
      for (const node of byId.values()) {
        const kids = node.children.filter((child): child is string => child !== null);
        if (kids.length === 0) continue;
        expect(kids).toHaveLength(2);
        const sum = kids.reduce((total, child) => total + Number(byId.get(child)?.label), 0);
        expect(Number(node.label)).toBe(sum);
      }
      const after = [...values];
      for (const op of ops) if (op.kind === 'set') after[op.index] = op.value;
      expect(leaves(end)).toEqual(after);
    }
  });

  it('has 2n - 1 nodes, whatever n is', () => {
    for (let n = 2; n <= MAX_LEAVES; n++) {
      const end = lastFrame(solve(Array.from({ length: n }, (_, at) => at), []));
      expect(treeOf(end).nodes).toHaveLength(2 * n - 1);
    }
  });
});

describe('segment tree: logarithmic work', () => {
  it('visits at most four nodes per level in a query', () => {
    const rng = makeRng(99);
    for (let trial = 0; trial < 100; trial++) {
      const n = randomInt(rng, 2, MAX_LEAVES);
      const from = randomInt(rng, 0, n - 1);
      const to = randomInt(rng, from, n - 1);
      const frames = solve(Array.from({ length: n }, () => 1), [{ kind: 'sum', from, to }]);
      const levels = Math.ceil(Math.log2(n)) + 1;
      const visited = lastFrame(frames).counters.extra['nodes visited'] ?? 0;
      expect(visited, `n=${n} sum ${from} ${to}`).toBeLessThanOrEqual(4 * levels);
    }
  });

  it('touches only the path from root to leaf in an update', () => {
    const n = 16;
    const frames = solve(Array.from({ length: n }, () => 1), [{ kind: 'set', index: 11, value: 4 }]);
    const updates = frames.filter((frame) => frame.phase === 'update' && frame.step === STEP.refresh);
    expect(updates).toHaveLength(Math.log2(n));
  });
});

describe('segment tree: input', () => {
  it('reads operations and rejects bad ones with a reason', () => {
    expect(parseOps('sum 1 3; set 0 4\nquery 0 0', 5)).toEqual({
      ok: true,
      value: [
        { kind: 'sum', from: 1, to: 3 },
        { kind: 'set', index: 0, value: 4 },
        { kind: 'sum', from: 0, to: 0 },
      ],
    });
    expect(parseOps('sum 3 1', 5).ok).toBe(false);
    expect(parseOps('sum 0 5', 5).ok).toBe(false);
    expect(parseOps('set 5 1', 5).ok).toBe(false);
    expect(parseOps('min 0 2', 5).ok).toBe(false);
    expect(parseOps('sum 0 1; '.repeat(7), 5).ok).toBe(false);
    expect(segmentTree.build({ input: '4', ops: '' }).ok).toBe(false);
    expect(segmentTree.build({ input: Array.from({ length: MAX_LEAVES + 1 }, () => 1).join(','), ops: '' }).ok).toBe(false);
    expect(segmentTree.build({ input: '1, 2.5', ops: '' }).ok).toBe(false);
  });
});

describe('segment tree: frame contract', () => {
  it('keeps the frame contract on random runs', () => {
    const rng = makeRng(5);
    for (let trial = 0; trial < 30; trial++) {
      const { values, ops } = randomCase(rng);
      expectFrameHygiene(segmentTree, solve(values, ops), HYGIENE);
    }
  });

  it('builds every preset', () => {
    const rng = makeRng(8);
    for (const preset of segmentTree.presets) {
      for (const size of [2, 3, 9, MAX_LEAVES]) {
        const result = segmentTree.build(preset.build(size, rng));
        expect(result.ok, `${preset.id} at ${size}`).toBe(true);
        if (result.ok) expectFrameHygiene(segmentTree, result.frames, HYGIENE);
      }
    }
  });

  it('is deterministic and honours its input contract', () => {
    expectDeterministic(segmentTree, {});
    expectInputContract(segmentTree);
  });
});
