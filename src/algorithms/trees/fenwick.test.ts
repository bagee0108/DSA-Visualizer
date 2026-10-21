import { describe, expect, it } from 'vitest';

import { makeRng, randomInt } from '../../core/random';
import type { Frame } from '../../core/types';
import { expectDeterministic, expectFrameHygiene, expectInputContract, lastFrame, matrixOf, runFrames } from '../frameHygiene';
import { fenwick, type FenwickOp, formatOp, JUMPS, lowbit, MAX_SIZE, parseOps, STEP } from './fenwick';

function solve(values: readonly number[], ops: readonly FenwickOp[]): readonly Frame[] {
  return runFrames(fenwick, { input: values.join(', '), ops: ops.map(formatOp).join('; ') });
}

/** Query answers, read back from the frame each query ends with. */
function answersOf(frames: readonly Frame[]): number[] {
  return frames
    .filter((frame) => frame.step === STEP.ret)
    .map((frame) => Number(/\] = (-?\d+)/.exec(frame.explanation)?.[1]));
}

function reference(values: readonly number[], ops: readonly FenwickOp[]): number[] {
  const a = [0, ...values];
  const out: number[] = [];
  const total = (from: number, to: number): number => a.slice(from, to + 1).reduce((sum, value) => sum + value, 0);
  for (const op of ops) {
    if (op.kind === 'add') a[op.index] = (a[op.index] ?? 0) + op.delta;
    else out.push(total(op.kind === 'range' ? op.from : 1, op.to));
  }
  return out;
}

/** tree[i] read back from the staircase: the one filled cell in column i above the a row. */
function treeOf(frame: Frame): number[] {
  const view = matrixOf(frame);
  const out: number[] = [];
  for (let col = 0; col < view.cols; col++) {
    for (let row = 0; row < view.rows - 1; row++) {
      const value = view.cells[row * view.cols + col];
      if (value !== null && value !== undefined) out.push(value);
    }
  }
  return out;
}

function randomCase(rng: () => number): { values: number[]; ops: FenwickOp[] } {
  const n = randomInt(rng, 2, MAX_SIZE);
  const values = Array.from({ length: n }, () => randomInt(rng, -20, 20));
  const ops: FenwickOp[] = Array.from({ length: randomInt(rng, 0, 6) }, (): FenwickOp => {
    const roll = rng();
    if (roll < 0.35) return { kind: 'add', index: randomInt(rng, 1, n), delta: randomInt(rng, -9, 9) };
    if (roll < 0.7) return { kind: 'sum', to: randomInt(rng, 1, n) };
    const from = randomInt(rng, 1, n);
    return { kind: 'range', from, to: randomInt(rng, from, n) };
  });
  return { values, ops };
}

describe('fenwick: correctness', () => {
  it('answers the default operations', () => {
    const values = [3, 2, 5, 1, 4, 6, 2, 7, 1, 3];
    const ops: FenwickOp[] = [
      { kind: 'sum', to: 7 },
      { kind: 'add', index: 3, delta: 4 },
      { kind: 'range', from: 3, to: 10 },
    ];
    expect(answersOf(solve(values, ops))).toEqual(reference(values, ops));
  });

  it('agrees with adding the slice, across random arrays and operations', () => {
    const rng = makeRng(1618);
    for (let trial = 0; trial < 150; trial++) {
      const { values, ops } = randomCase(rng);
      expect(answersOf(solve(values, ops)), `${values.join(',')} | ${ops.map(formatOp).join('; ')}`).toEqual(reference(values, ops));
    }
  });

  it('ends with tree[i] equal to the sum of the lowbit(i) elements ending at i', () => {
    const rng = makeRng(77);
    for (let trial = 0; trial < 50; trial++) {
      const { values, ops } = randomCase(rng);
      const a = [0, ...values];
      for (const op of ops) if (op.kind === 'add') a[op.index] = (a[op.index] ?? 0) + op.delta;
      const expected = values.map((_, at) => {
        const i = at + 1;
        return a.slice(i - lowbit(i) + 1, i + 1).reduce((sum, value) => sum + value, 0);
      });
      expect(treeOf(lastFrame(solve(values, ops)))).toEqual(expected);
    }
  });

  it('puts exactly one tree cell in each column, on the row of its lowbit', () => {
    const view = matrixOf(lastFrame(solve(Array.from({ length: 12 }, () => 1), [])));
    expect(view.rowHeaders).toEqual(['len 8', 'len 4', 'len 2', 'len 1', 'a']);
    expect(view.colHeaders[5]).toBe('0110');
    for (let col = 0; col < view.cols; col++) {
      const filled = Array.from({ length: view.rows - 1 }, (_, row) => view.cells[row * view.cols + col]).filter((cell) => cell !== null);
      expect(filled).toHaveLength(1);
      expect(view.cells[(view.rows - 2 - Math.log2(lowbit(col + 1))) * view.cols + col]).not.toBeNull();
    }
  });
});

describe('fenwick: one jump per bit', () => {
  it('takes one range per 1 bit of i in a prefix sum', () => {
    for (let to = 1; to <= MAX_SIZE; to++) {
      const frames = solve(Array.from({ length: MAX_SIZE }, () => 1), [{ kind: 'sum', to }]);
      const steps = frames.filter((frame) => frame.step === STEP.prefixStep);
      expect(steps, `sum ${to}`).toHaveLength(to.toString(2).split('').filter((bit) => bit === '1').length);
    }
  });

  it('touches at most log n + 1 cells in an update', () => {
    for (let index = 1; index <= MAX_SIZE; index++) {
      const frames = solve(Array.from({ length: MAX_SIZE }, () => 1), [{ kind: 'add', index, delta: 1 }]);
      const steps = frames.filter((frame) => frame.step === STEP.addStep);
      expect(steps.length).toBeLessThanOrEqual(Math.log2(MAX_SIZE) + 1);
    }
  });

  it('counts its jumps', () => {
    const end = lastFrame(solve([1, 1, 1, 1, 1, 1, 1, 1], [{ kind: 'sum', to: 7 }]));
    // Build passes up from every i but 8 (8 + 8 is past the end): 7 jumps. sum 7 jumps 7 -> 6 -> 4: 2 more.
    expect(end.counters.extra[JUMPS]).toBe(7 + 2);
  });
});

describe('fenwick: frames do not change after they are yielded', () => {
  it('shows only the ranges summed so far at each prefix step', () => {
    const frames = solve([3, 2, 5, 1, 4, 6, 2, 7], [{ kind: 'sum', to: 7 }]);
    const steps = frames.filter((frame) => frame.step === STEP.prefixStep);
    // 7 covers a[7]; 6 adds a[5..6]; 4 adds a[1..4].
    expect(steps.map((frame) => frame.highlights.visited?.length)).toEqual([1, 3, 7]);
  });
});

describe('fenwick: input', () => {
  it('reads operations and rejects bad ones with a reason', () => {
    expect(parseOps('sum 4; range 2 3\nadd 1 -2', 5)).toEqual({
      ok: true,
      value: [
        { kind: 'sum', to: 4 },
        { kind: 'range', from: 2, to: 3 },
        { kind: 'add', index: 1, delta: -2 },
      ],
    });
    expect(parseOps('sum 0', 5).ok).toBe(false);
    expect(parseOps('sum 6', 5).ok).toBe(false);
    expect(parseOps('range 4 2', 5).ok).toBe(false);
    expect(parseOps('add 2', 5).ok).toBe(false);
    expect(parseOps('sum 1.5', 5).ok).toBe(false);
    expect(fenwick.build({ input: '7', ops: '' }).ok).toBe(false);
  });
});

describe('fenwick: frame contract', () => {
  it('keeps the frame contract on random runs', () => {
    const rng = makeRng(12);
    for (let trial = 0; trial < 30; trial++) {
      const { values, ops } = randomCase(rng);
      expectFrameHygiene(fenwick, solve(values, ops));
    }
  });

  it('builds every preset', () => {
    const rng = makeRng(4);
    for (const preset of fenwick.presets) {
      for (const size of [2, 3, 7, MAX_SIZE]) {
        const result = fenwick.build(preset.build(size, rng));
        expect(result.ok, `${preset.id} at ${size}`).toBe(true);
        if (result.ok) expectFrameHygiene(fenwick, result.frames);
      }
    }
  });

  it('is deterministic and honours its input contract', () => {
    expectDeterministic(fenwick, {});
    expectInputContract(fenwick);
  });
});
