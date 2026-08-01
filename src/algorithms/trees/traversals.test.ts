import { describe, expect, it } from 'vitest';

import { makeRng, shuffle } from '../../core/random';
import type { Frame } from '../../core/types';
import { expectDeterministic, expectFrameHygiene, expectInputContract, lastFrame, runFrames, treeOf } from '../frameHygiene';
import { treeTraversals } from './traversals';
import { outputLabels } from './treeTestkit';

type Order = 'preorder' | 'inorder' | 'postorder' | 'levelorder';

function run(keys: readonly number[], order: Order): readonly Frame[] {
  return runFrames(treeTraversals, { input: keys.join(','), order });
}

function output(frames: readonly Frame[]): number[] {
  return outputLabels(lastFrame(frames)).map(Number);
}

interface RefNode {
  key: number;
  left: RefNode | null;
  right: RefNode | null;
}

function refBst(keys: readonly number[]): RefNode | null {
  let root: RefNode | null = null;
  for (const key of keys) {
    const node: RefNode = { key, left: null, right: null };
    if (root === null) {
      root = node;
      continue;
    }
    let cur = root;
    for (;;) {
      if (key < cur.key) {
        if (cur.left === null) {
          cur.left = node;
          break;
        }
        cur = cur.left;
      } else {
        if (cur.right === null) {
          cur.right = node;
          break;
        }
        cur = cur.right;
      }
    }
  }
  return root;
}

function refTraverse(root: RefNode | null, order: Order): number[] {
  const out: number[] = [];
  if (order === 'levelorder') {
    const queue: RefNode[] = root === null ? [] : [root];
    while (queue.length > 0) {
      const node = queue.shift();
      if (node === undefined) break;
      out.push(node.key);
      if (node.left !== null) queue.push(node.left);
      if (node.right !== null) queue.push(node.right);
    }
    return out;
  }
  const walk = (node: RefNode | null): void => {
    if (node === null) return;
    if (order === 'preorder') out.push(node.key);
    walk(node.left);
    if (order === 'inorder') out.push(node.key);
    walk(node.right);
    if (order === 'postorder') out.push(node.key);
  };
  walk(root);
  return out;
}

const ORDERS: readonly Order[] = ['preorder', 'inorder', 'postorder', 'levelorder'];

describe('tree traversals: output order', () => {
  it('matches a reference traversal on the default tree', () => {
    const keys = [50, 30, 70, 20, 40, 60, 80, 35, 45];
    for (const order of ORDERS) {
      expect(output(run(keys, order)), order).toEqual(refTraverse(refBst(keys), order));
    }
  });

  it('matches the reference across random trees', () => {
    const rng = makeRng(1234);
    for (let trial = 0; trial < 25; trial++) {
      const keys = shuffle(Array.from({ length: 20 }, (_, i) => i + 1), rng).slice(0, 5 + Math.floor(rng() * 12));
      for (const order of ORDERS) {
        expect(output(run(keys, order)), `${order} on ${keys.join(',')}`).toEqual(refTraverse(refBst(keys), order));
      }
    }
  });

  it('in-order on a BST is the sorted key list', () => {
    const keys = [8, 3, 10, 1, 6, 14, 4, 7, 13];
    expect(output(run(keys, 'inorder'))).toEqual([...keys].sort((a, b) => a - b));
  });

  it('visits every node exactly once in every order', () => {
    const keys = [8, 3, 10, 1, 6, 14, 4, 7, 13];
    for (const order of ORDERS) {
      const visited = output(run(keys, order));
      expect([...visited].sort((a, b) => a - b)).toEqual([...keys].sort((a, b) => a - b));
    }
  });

  it('handles a single node and a chain', () => {
    for (const order of ORDERS) {
      expect(output(run([42], order))).toEqual([42]);
      expect(output(run([1, 2, 3, 4], order))).toEqual(refTraverse(refBst([1, 2, 3, 4]), order));
    }
  });
});

describe('tree traversals: the mechanism on screen', () => {
  it('recursive orders make exactly 2n+1 calls, one per node plus one per null child', () => {
    const keys = [50, 30, 70, 20, 40, 60, 80];
    for (const order of ['preorder', 'inorder', 'postorder'] as const) {
      expect(lastFrame(run(keys, order)).counters.recursiveCalls, order).toBe(2 * keys.length + 1);
    }
  });

  it('shows recursion depth equal to the tree height in the call stack', () => {
    const chain = [1, 2, 3, 4, 5];
    const frames = run(chain, 'preorder');
    expect(Math.max(...frames.map((frame) => frame.callStack.length))).toBe(chain.length + 1);
  });

  it('level-order shows the queue, and it never exceeds the widest level', () => {
    const keys = [50, 30, 70, 20, 40, 60, 80];
    const frames = run(keys, 'levelorder');
    let widest = 0;
    let sawQueue = false;
    for (const frame of frames) {
      const queue = treeOf(frame).strips.find((strip) => strip.kind === 'queue');
      if (queue === undefined) continue;
      sawQueue = true;
      widest = Math.max(widest, queue.items.length);
    }
    expect(sawQueue).toBe(true);
    expect(widest).toBe(4);
    expect(lastFrame(run(keys, 'levelorder')).counters.recursiveCalls).toBe(0);
  });

  it('grows the output strip monotonically', () => {
    for (const order of ORDERS) {
      let previous = 0;
      for (const frame of run([5, 3, 8, 1, 4], order)) {
        const length = outputLabels(frame).length;
        expect(length).toBeGreaterThanOrEqual(previous);
        previous = length;
      }
    }
  });
});

describe('tree traversals: frame hygiene', () => {
  it('holds every structural invariant in every order', () => {
    for (const order of ORDERS) expectFrameHygiene(treeTraversals, run([50, 30, 70, 20, 40, 60, 80], order));
  });

  it('is deterministic', () => {
    expectDeterministic(treeTraversals, { input: '5,3,8', order: 'postorder' });
  });

  it('honours its input contract', () => {
    expectInputContract(treeTraversals);
  });

  it('rejects an unknown order and an empty tree', () => {
    expect(treeTraversals.build({ input: '1,2', order: 'sideways' }).ok).toBe(false);
    expect(treeTraversals.build({ input: '   ', order: 'inorder' }).ok).toBe(false);
  });
});
