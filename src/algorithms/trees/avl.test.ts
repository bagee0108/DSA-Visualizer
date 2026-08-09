import { describe, expect, it } from 'vitest';

import { makeRng, shuffle } from '../../core/random';
import { expectDeterministic, expectFrameHygiene, expectInputContract, lastFrame, runFrames, treeOf } from '../frameHygiene';
import { avl } from './avl';
import { inorderKeys, isAvl, isBst, nodeMap, settledFrames, treeHeight } from './treeTestkit';

function run(keys: readonly number[], ops = ''): ReturnType<typeof runFrames> {
  return runFrames(avl, { input: keys.join(','), ops });
}

function rootLabel(frames: ReturnType<typeof runFrames>): string | undefined {
  const tree = treeOf(lastFrame(frames));
  return tree.rootId === null ? undefined : nodeMap(tree).get(tree.rootId)?.label;
}

function rotations(frames: ReturnType<typeof runFrames>): number {
  return lastFrame(frames).counters.extra.rotations ?? 0;
}

describe('avl: the balance invariant', () => {
  it('holds in every settled frame, and so does the BST ordering', () => {
    const frames = runFrames(avl, {});
    const settled = settledFrames(frames);
    expect(settled.length).toBeGreaterThan(5);
    for (const frame of settled) {
      expect(isBst(treeOf(frame))).toBe(true);
      expect(isAvl(treeOf(frame))).toBe(true);
    }
  });

  it('keeps the badges honest: h and bf match the real subtree heights', () => {
    const frames = run([50, 30, 70, 20, 40, 60, 80, 10, 25], 'insert 5; delete 70');
    for (const frame of settledFrames(frames)) {
      const tree = treeOf(frame);
      const byId = nodeMap(tree);
      const height = (id: string | null): number => {
        if (id === null) return 0;
        const node = byId.get(id);
        if (node === undefined) return 0;
        return 1 + Math.max(height(node.children[0] ?? null), height(node.children[1] ?? null));
      };
      for (const node of tree.nodes) {
        const expectedH = height(node.id);
        const expectedBf = height(node.children[0] ?? null) - height(node.children[1] ?? null);
        expect(node.badges?.h, `h of ${node.label}`).toBe(expectedH);
        expect(node.badges?.bf, `bf of ${node.label}`).toBe(expectedBf);
      }
    }
  });

  it('stays within the 1.44 log2(n+2) height bound on random and adversarial input', () => {
    const rng = makeRng(1618);
    const shapes: number[][] = [
      Array.from({ length: 31 }, (_, i) => i + 1),
      Array.from({ length: 31 }, (_, i) => 31 - i),
      shuffle(Array.from({ length: 31 }, (_, i) => i + 1), rng),
      shuffle(Array.from({ length: 31 }, (_, i) => i + 1), rng),
    ];
    for (const keys of shapes) {
      const final = treeOf(lastFrame(run(keys)));
      const n = final.nodes.length;
      expect(treeHeight(final)).toBeLessThanOrEqual(Math.floor(1.44 * Math.log2(n + 2)));
      expect(isAvl(final)).toBe(true);
    }
  });

  it('turns a sorted insertion into a log-height tree where a BST would chain', () => {
    const final = treeOf(lastFrame(run(Array.from({ length: 15 }, (_, i) => i + 1))));
    expect(treeHeight(final)).toBe(4);
    expect(inorderKeys(final)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });
});

describe('avl: the four rotation cases', () => {
  it('RR: ascending triple rotates left once, middle key becomes root', () => {
    const frames = run([10, 20, 30]);
    expect(rotations(frames)).toBe(1);
    expect(rootLabel(frames)).toBe('20');
    expect(frames.some((frame) => /Right-heavy/.test(frame.explanation))).toBe(true);
  });

  it('LL: descending triple rotates right once', () => {
    const frames = run([30, 20, 10]);
    expect(rotations(frames)).toBe(1);
    expect(rootLabel(frames)).toBe('20');
    expect(frames.some((frame) => /Left-heavy \(bf 2\)/.test(frame.explanation))).toBe(true);
  });

  it('LR: zig-zag needs two rotations', () => {
    const frames = run([30, 10, 20]);
    expect(rotations(frames)).toBe(2);
    expect(rootLabel(frames)).toBe('20');
    expect(frames.some((frame) => /the LR case/.test(frame.explanation))).toBe(true);
  });

  it('RL: mirrored zig-zag needs two rotations', () => {
    const frames = run([10, 30, 20]);
    expect(rotations(frames)).toBe(2);
    expect(rootLabel(frames)).toBe('20');
    expect(frames.some((frame) => /the RL case/.test(frame.explanation))).toBe(true);
  });

  it('never rotates when the tree stays balanced', () => {
    expect(rotations(run([20, 10, 30]))).toBe(0);
  });

  it('does at most one rotation per insert (single or double)', () => {
    const keys = shuffle(Array.from({ length: 25 }, (_, i) => i + 1), makeRng(9));
    const frames = run(keys);
    expect(rotations(frames)).toBeLessThanOrEqual(2 * keys.length);
  });
});

describe('avl: deletion', () => {
  it('rebalances after deletions and keeps the key set right', () => {
    const rng = makeRng(4321);
    for (let trial = 0; trial < 30; trial++) {
      const pool = shuffle(Array.from({ length: 30 }, (_, i) => i + 1), rng);
      const keys = pool.slice(0, 10 + Math.floor(rng() * 8));
      const expected = new Set(keys);
      const ops: string[] = [];
      for (let k = 0; k < 5; k++) {
        const key = pool[Math.floor(rng() * pool.length)] ?? 1;
        if (rng() < 0.6) {
          ops.push(`delete ${key}`);
          expected.delete(key);
        } else {
          ops.push(`insert ${key}`);
          expected.add(key);
        }
      }
      const frames = run(keys, ops.join('; '));
      for (const frame of settledFrames(frames)) {
        expect(isBst(treeOf(frame))).toBe(true);
        expect(isAvl(treeOf(frame))).toBe(true);
      }
      expect(inorderKeys(treeOf(lastFrame(frames)))).toEqual([...expected].sort((a, b) => a - b));
    }
  });

  it('can need a rotation at every level on the way up', () => {
    const frames = run([8, 5, 11, 3, 7, 10, 12, 2, 4, 6, 9, 1], 'delete 12');
    expect(rotations(frames)).toBeGreaterThanOrEqual(1);
    expect(isAvl(treeOf(lastFrame(frames)))).toBe(true);
  });

  it('handles deleting the root and deleting down to empty', () => {
    const frames = run([2, 1, 3], 'delete 2; delete 1; delete 3');
    const final = treeOf(lastFrame(frames));
    expect(final.rootId).toBeNull();
    expect(final.nodes).toHaveLength(0);
  });
});

describe('avl: frame hygiene', () => {
  it('holds every structural invariant, including through rotations', () => {
    expectFrameHygiene(avl, runFrames(avl, {}));
    expectFrameHygiene(avl, run(Array.from({ length: 20 }, (_, i) => i + 1), 'delete 1; delete 2; delete 3'));
  });

  it('shows the recursion in the call stack', () => {
    const frames = run([10, 20, 30, 40]);
    expect(Math.max(...frames.map((frame) => frame.callStack.length))).toBeGreaterThanOrEqual(3);
    expect(lastFrame(frames).callStack).toHaveLength(0);
  });

  it('is deterministic', () => {
    expectDeterministic(avl, { input: '10,20,30,40,50,25', ops: 'delete 40' });
  });

  it('honours its input contract', () => {
    expectInputContract(avl);
  });

  it('refuses search, which it does not visualise', () => {
    expect(avl.build({ input: '1,2,3', ops: 'search 2' }).ok).toBe(false);
  });

  it('builds a runnable input from every preset', () => {
    for (const preset of avl.presets) {
      const params = preset.build(12, makeRng(7));
      expect(avl.build(params).ok, `preset=${preset.id}`).toBe(true);
    }
  });

  it('low-key preset inserts below every initial key, so the rank shift is total', () => {
    const preset = avl.presets.find((candidate) => candidate.id === 'low-key');
    expect(preset).toBeDefined();
    if (preset === undefined) return;
    const params = preset.build(12, makeRng(3));
    const initial = (params.input ?? '').split(',').map(Number);
    const first = Number(/insert (\d+)/.exec(params.ops ?? '')?.[1]);
    expect(first).toBeLessThan(Math.min(...initial));
    const keys = inorderKeys(treeOf(lastFrame(runFrames(avl, params))));
    expect(keys[0]).toBe(first);
    expect(keys).toHaveLength(initial.length + 3);
  });
});
