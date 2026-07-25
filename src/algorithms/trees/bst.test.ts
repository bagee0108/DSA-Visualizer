import { describe, expect, it } from 'vitest';

import { makeRng, shuffle } from '../../core/random';
import { expectDeterministic, expectFrameHygiene, expectInputContract, lastFrame, runFrames, treeOf } from '../frameHygiene';
import { bst } from './bst';
import { inorderKeys, isBst, settledFrames, treeHeight } from './treeTestkit';

function run(keys: readonly number[], ops = ''): ReturnType<typeof runFrames> {
  return runFrames(bst, { input: keys.join(','), ops });
}

describe('bst: the ordering invariant', () => {
  it('holds in every settled frame of the default run', () => {
    const frames = runFrames(bst, {});
    const settled = settledFrames(frames);
    expect(settled.length).toBeGreaterThan(10);
    for (const frame of settled) expect(isBst(treeOf(frame))).toBe(true);
  });

  it('reads the keys back sorted, in-order', () => {
    const keys = [50, 30, 70, 20, 40, 60, 80, 35, 45, 65];
    const final = treeOf(lastFrame(run(keys)));
    expect(inorderKeys(final)).toEqual([...keys].sort((a, b) => a - b));
  });

  it('survives random insert/delete/search mixes', () => {
    const rng = makeRng(2718);
    for (let trial = 0; trial < 40; trial++) {
      const pool = shuffle(Array.from({ length: 40 }, (_, i) => i + 1), rng);
      const keys = pool.slice(0, 8 + Math.floor(rng() * 10));
      const expected = new Set(keys);
      const ops: string[] = [];
      for (let k = 0; k < 6; k++) {
        const roll = rng();
        if (roll < 0.4) {
          const key = pool[Math.floor(rng() * pool.length)] ?? 1;
          ops.push(`insert ${key}`);
          expected.add(key);
        } else if (roll < 0.8) {
          const key = pool[Math.floor(rng() * pool.length)] ?? 1;
          ops.push(`delete ${key}`);
          expected.delete(key);
        } else {
          ops.push(`search ${pool[Math.floor(rng() * pool.length)] ?? 1}`);
        }
      }
      const frames = run(keys, ops.join('; '));
      for (const frame of settledFrames(frames)) expect(isBst(treeOf(frame))).toBe(true);
      expect(inorderKeys(treeOf(lastFrame(frames)))).toEqual([...expected].sort((a, b) => a - b));
    }
  });
});

describe('bst: delete cases', () => {
  it('removes a leaf', () => {
    const final = treeOf(lastFrame(run([50, 30, 70], 'delete 30')));
    expect(inorderKeys(final)).toEqual([50, 70]);
    expect(final.nodes).toHaveLength(2);
  });

  it('splices a one-child node', () => {
    const final = treeOf(lastFrame(run([50, 30, 20], 'delete 30')));
    expect(inorderKeys(final)).toEqual([20, 50]);
    const root = final.nodes.find((node) => node.id === final.rootId);
    expect(root?.label).toBe('50');
    const left = final.nodes.find((node) => node.id === root?.children[0]);
    expect(left?.label).toBe('20');
  });

  it('copies the successor for a two-child node and keeps the node identity', () => {
    const frames = run([50, 30, 70, 60, 80, 65], 'delete 50');
    const first = treeOf(frames[0]);
    const final = treeOf(lastFrame(frames));
    expect(final.rootId).toBe(first.rootId ?? final.rootId);
    const root = final.nodes.find((node) => node.id === final.rootId);
    expect(root?.label).toBe('60');
    expect(inorderKeys(final)).toEqual([30, 60, 65, 70, 80]);
  });

  it('deletes the root of a single-node tree', () => {
    const final = treeOf(lastFrame(run([7], 'delete 7')));
    expect(final.rootId).toBeNull();
    expect(final.nodes).toHaveLength(0);
  });

  it('ignores a missing key', () => {
    const frames = run([50, 30, 70], 'delete 99');
    expect(treeOf(lastFrame(frames)).nodes).toHaveLength(3);
    expect(frames.some((frame) => /not in the tree/.test(frame.explanation))).toBe(true);
  });
});

describe('bst: search and insert', () => {
  it('reports hits and misses through the frame phase', () => {
    const hit = run([50, 30, 70], 'search 30');
    expect(hit.some((frame) => frame.phase === 'search' && (frame.highlights.sorted ?? []).length === 1)).toBe(true);
    const miss = run([50, 30, 70], 'search 31');
    expect(miss.some((frame) => /not in the tree/.test(frame.explanation))).toBe(true);
  });

  it('costs at most height+1 comparisons per search', () => {
    const keys = [50, 30, 70, 20, 40, 60, 80];
    for (const target of [20, 80, 55]) {
      const frames = run(keys, `search ${target}`);
      const before = frames.findLast((frame) => frame.phase === 'build');
      const after = lastFrame(frames);
      const used = after.counters.comparisons - (before?.counters.comparisons ?? 0);
      expect(used).toBeLessThanOrEqual(treeHeight(treeOf(after)) + 1);
    }
  });

  it('treats a duplicate insert as a no-op', () => {
    const frames = run([50, 30, 70], 'insert 30');
    expect(treeOf(lastFrame(frames)).nodes).toHaveLength(3);
    expect(frames.some((frame) => /no-op/.test(frame.explanation))).toBe(true);
  });

  it('degenerates into a chain on sorted input', () => {
    const keys = Array.from({ length: 12 }, (_, i) => i + 1);
    expect(treeHeight(treeOf(lastFrame(run(keys))))).toBe(12);
  });
});

describe('bst: frame hygiene', () => {
  it('holds every structural invariant', () => {
    expectFrameHygiene(bst, runFrames(bst, {}));
  });

  it('is deterministic', () => {
    expectDeterministic(bst, { input: '5,3,8,1,4', ops: 'delete 3; insert 6' });
  });

  it('honours its input contract', () => {
    expectInputContract(bst);
  });

  it('rejects duplicates and malformed operations with reasons', () => {
    const dup = bst.build({ input: '5, 5' });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toMatch(/duplicate/i);
    const bad = bst.build({ input: '5', ops: 'frobnicate 3' });
    expect(bad.ok).toBe(false);
    const empty = bst.build({ input: '  ', ops: ' ' });
    expect(empty.ok).toBe(false);
  });

  it('accepts the shorthand operation syntax', () => {
    const frames = runFrames(bst, { input: '10, 5', ops: '+7, -5, ?7' });
    expect(inorderKeys(treeOf(lastFrame(frames)))).toEqual([7, 10]);
  });
});
