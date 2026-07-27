import { describe, expect, it } from 'vitest';

import { makeRng, shuffle } from '../../core/random';
import { expectDeterministic, expectFrameHygiene, expectInputContract, lastFrame, runFrames, treeOf } from '../frameHygiene';
import { redBlack } from './redBlack';
import { inorderKeys, isBst, redBlackViolation, settledFrames, treeHeight } from './treeTestkit';

function run(keys: readonly number[], ops = ''): ReturnType<typeof runFrames> {
  return runFrames(redBlack, { input: keys.join(','), ops });
}

describe('red-black: the three invariants', () => {
  it('hold in every settled frame of the default run', () => {
    const frames = runFrames(redBlack, {});
    const settled = settledFrames(frames);
    expect(settled.length).toBeGreaterThan(5);
    for (const frame of settled) {
      expect(redBlackViolation(treeOf(frame))).toBeNull();
      expect(isBst(treeOf(frame))).toBe(true);
    }
  });

  it('hold after every insert across random and sorted orders', () => {
    const rng = makeRng(31);
    const orders: number[][] = [
      Array.from({ length: 40 }, (_, i) => i + 1),
      Array.from({ length: 40 }, (_, i) => 40 - i),
      shuffle(Array.from({ length: 40 }, (_, i) => i + 1), rng),
      shuffle(Array.from({ length: 40 }, (_, i) => i + 1), rng),
      shuffle(Array.from({ length: 40 }, (_, i) => i + 1), rng),
    ];
    for (const keys of orders) {
      const frames = run(keys);
      for (const frame of settledFrames(frames)) expect(redBlackViolation(treeOf(frame))).toBeNull();
      expect(inorderKeys(treeOf(lastFrame(frames)))).toEqual([...keys].sort((a, b) => a - b));
    }
  });

  it('bounds the height by 2 log2(n+1)', () => {
    for (const keys of [Array.from({ length: 40 }, (_, i) => i + 1), shuffle(Array.from({ length: 40 }, (_, i) => i + 1), makeRng(7))]) {
      const final = treeOf(lastFrame(run(keys)));
      expect(treeHeight(final)).toBeLessThanOrEqual(2 * Math.log2(final.nodes.length + 1));
    }
  });

  it('paints every node and keeps the root black', () => {
    const final = treeOf(lastFrame(run([5, 3, 8, 1, 4, 7, 9])));
    for (const node of final.nodes) expect(node.color).toBeDefined();
    expect(final.nodes.find((node) => node.id === final.rootId)?.color).toBe('black');
  });
});

describe('red-black: the fixup cases', () => {
  const caseFrames = (keys: readonly number[], pattern: RegExp): number =>
    run(keys).filter((frame) => pattern.test(frame.explanation)).length;

  it('case 1 recolours when the uncle is red', () => {
    expect(caseFrames([10, 5, 15, 3], /Case 1/)).toBeGreaterThan(0);
    const frames = run([10, 5, 15, 3]);
    expect(lastFrame(frames).counters.extra.rotations ?? 0).toBe(0);
  });

  it('case 3 rotates once for an outer grandchild', () => {
    const frames = run([10, 5, 3]);
    expect(frames.some((frame) => /Case 3/.test(frame.explanation))).toBe(true);
    expect(frames.some((frame) => /Case 2/.test(frame.explanation))).toBe(false);
    expect(lastFrame(frames).counters.extra.rotations ?? 0).toBe(1);
    const final = treeOf(lastFrame(frames));
    expect(final.nodes.find((node) => node.id === final.rootId)?.label).toBe('5');
  });

  it('case 2 straightens an inner grandchild, then case 3 finishes', () => {
    const frames = run([10, 5, 7]);
    expect(frames.some((frame) => /Case 2/.test(frame.explanation))).toBe(true);
    expect(frames.some((frame) => /Case 3/.test(frame.explanation))).toBe(true);
    expect(lastFrame(frames).counters.extra.rotations ?? 0).toBe(2);
    const final = treeOf(lastFrame(frames));
    expect(final.nodes.find((node) => node.id === final.rootId)?.label).toBe('7');
  });

  it('never needs more than two rotations per insert', () => {
    const keys = shuffle(Array.from({ length: 40 }, (_, i) => i + 1), makeRng(99));
    const frames = run(keys);
    expect(lastFrame(frames).counters.extra.rotations ?? 0).toBeLessThanOrEqual(2 * keys.length);
  });

  it('ignores a duplicate key', () => {
    const frames = run([10, 5, 15], 'insert 5');
    expect(treeOf(lastFrame(frames)).nodes).toHaveLength(3);
  });
});

describe('red-black: frame hygiene', () => {
  it('holds every structural invariant', () => {
    expectFrameHygiene(redBlack, runFrames(redBlack, {}));
    expectFrameHygiene(redBlack, run(Array.from({ length: 20 }, (_, i) => i + 1)));
  });

  it('is deterministic', () => {
    expectDeterministic(redBlack, { input: '10,20,30,15,25,5,1' });
  });

  it('honours its input contract', () => {
    expectInputContract(redBlack);
  });

  it('refuses delete, which is documented as not implemented', () => {
    const result = redBlack.build({ input: '1,2,3', ops: 'delete 2' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not supported/i);
  });
});
