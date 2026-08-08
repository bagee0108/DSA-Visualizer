/**
 * AVL tree: insert and delete with rebalancing on the way back up. Rotations
 * reattach nodes in place, and because the renderer positions nodes by
 * in-order rank, a rotation plays as nodes moving straight up and down - the x
 * order is the thing a rotation is defined to preserve.
 */

import { seedField } from '../../core/arrayInput';
import { defineAlgorithm, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
import { randomInt } from '../../core/random';
import { LEFT, RIGHT, TreeScene, type Side } from '../../core/treeScene';
import {
  distinctKeys,
  keysField,
  medianFirst,
  opsField,
  parseKeyOps,
  parseTreeKeys,
  treePresets,
  type KeyOp,
} from '../../core/treeInput';
import type { Frame } from '../../core/types';

interface AvlInput {
  readonly keys: readonly number[];
  readonly ops: readonly KeyOp[];
}

const CODE = `function insert(node: Node | null, key: number): Node {
  if (node === null) return new Node(key);
  if (key < node.key)      node.left  = insert(node.left, key);
  else if (key > node.key) node.right = insert(node.right, key);
  else return node;                             // duplicate: unchanged
  return rebalance(node);                       // fix on the way back up
}

function rebalance(node: Node): Node {
  update(node);                                 // h = 1 + max(h(l), h(r))
  const bf = height(node.left) - height(node.right);
  if (bf > 1) {                                 // left-heavy
    if (balance(node.left) < 0) node.left = rotateLeft(node.left);    // LR
    return rotateRight(node);                   // LL
  }
  if (bf < -1) {                                // right-heavy
    if (balance(node.right) > 0) node.right = rotateRight(node.right); // RL
    return rotateLeft(node);                    // RR
  }
  return node;                                  // |bf| <= 1: nothing to do
}

function rotateLeft(x: Node): Node {            // x's right child y moves up
  const y = x.right;
  x.right = y.left;                             // y's left subtree crosses over
  y.left = x;
  update(x); update(y);
  return y;                                     // rotateRight is the mirror image
}

function remove(node: Node | null, key: number): Node | null {
  if (node === null) return null;
  if (key < node.key)      node.left  = remove(node.left, key);
  else if (key > node.key) node.right = remove(node.right, key);
  else if (node.left === null || node.right === null) {
    return node.left ?? node.right;             // 0 or 1 child: splice out
  } else {
    const succ = min(node.right);               // two children: copy successor
    node.key = succ.key;
    node.right = remove(node.right, succ.key);
  }
  return rebalance(node);                       // every ancestor re-checks
}`;

const LINE = {
  insertEnter: 1,
  insertNew: 2,
  insertLeft: 3,
  insertRight: 4,
  insertDup: 5,
  insertRebalance: 6,
  rebalanceEnter: 9,
  update: 10,
  bf: 11,
  leftHeavy: 12,
  caseLR: 13,
  caseLL: 14,
  rightHeavy: 16,
  caseRL: 17,
  caseRR: 18,
  balanced: 20,
  rotateEnter: 23,
  rotatePick: 24,
  rotateCross: 25,
  rotateHang: 26,
  rotateUpdate: 27,
  rotateReturn: 28,
  removeEnter: 31,
  removeNull: 32,
  removeLeft: 33,
  removeRight: 34,
  removeOneChild: 35,
  removeSplice: 36,
  removeSucc: 38,
  removeCopy: 39,
  removeRecurse: 40,
  removeRebalance: 42,
} as const;

class Avl {
  readonly scene = new TreeScene('binary');
  private readonly heights = new Map<string, number>();

  height(id: string | null): number {
    return id === null ? 0 : (this.heights.get(id) ?? 1);
  }

  balance(id: string): number {
    return this.height(this.scene.left(id)) - this.height(this.scene.right(id));
  }

  update(id: string): void {
    const h = 1 + Math.max(this.height(this.scene.left(id)), this.height(this.scene.right(id)));
    this.heights.set(id, h);
    this.scene.setBadges(id, { h, bf: this.balance(id) });
  }

  forget(id: string): void {
    this.heights.delete(id);
  }

  *rotate(x: string, direction: 'left' | 'right'): Generator<Frame, string, undefined> {
    const scene = this.scene;
    const towards: Side = direction === 'left' ? RIGHT : LEFT;
    const away: Side = direction === 'left' ? LEFT : RIGHT;
    const yBefore = scene.child(x, towards);
    if (yBefore === null) throw new Error(`rotate${direction}: ${x} has no child on that side`);
    const crossingBefore = scene.child(yBefore, away);

    scene.pushCall({ label: `rotate${direction === 'left' ? 'Left' : 'Right'}(${scene.label(x)})`, codeLine: LINE.rotateEnter });
    yield scene.frame({
      codeLine: LINE.rotatePick,
      explanation: `Rotate ${direction} at ${scene.label(x)}: its ${direction === 'left' ? 'right' : 'left'} child ${scene.label(yBefore)} will become the parent${crossingBefore === null ? '' : `, and ${scene.label(crossingBefore)} will cross over to ${scene.label(x)}`}.`,
      highlights: { swapped: [x], pivot: [yBefore], ...(crossingBefore === null ? {} : { candidate: [crossingBefore] }) },
      pointers: { x, y: yBefore },
      phase: 'rotate',
    });

    const { y, crossing } = scene.rotate(x, direction);
    yield scene.frame({
      codeLine: LINE.rotateCross,
      explanation:
        crossing === null
          ? `${scene.label(y)} had no ${direction === 'left' ? 'left' : 'right'} subtree, so nothing crossed over. ${scene.label(x)} hangs off ${scene.label(y)} now.`
          : `${scene.label(crossing)} crossed over to become the ${direction === 'left' ? 'right' : 'left'} child of ${scene.label(x)}. Its keys sit between ${scene.label(x)} and ${scene.label(y)}, so in-order is preserved.`,
      highlights: { swapped: [x], pivot: [y], ...(crossing === null ? {} : { candidate: [crossing] }) },
      pointers: { x, y },
      phase: 'rotate',
    });

    yield scene.frame({
      codeLine: LINE.rotateHang,
      explanation: `${scene.label(y)} took the slot ${scene.label(x)} had. Notice nothing moved sideways: a rotation only changes depths.`,
      highlights: { swapped: [x], pivot: [y] },
      pointers: { x, y },
      phase: 'rotate',
    });

    this.update(x);
    this.update(y);
    yield scene.frame({
      codeLine: LINE.rotateUpdate,
      explanation: `Recompute heights bottom-up: ${scene.label(x)} is h${this.height(x)}, ${scene.label(y)} is h${this.height(y)}.`,
      highlights: { active: [x, y] },
      pointers: { x, y },
      phase: 'rotate',
    });
    scene.popCall();
    return y;
  }

  *rebalance(node: string): Generator<Frame, string, undefined> {
    const scene = this.scene;
    scene.pushCall({ label: `rebalance(${scene.label(node)})`, codeLine: LINE.rebalanceEnter });

    this.update(node);
    const bf = this.balance(node);
    scene.countComparison();
    yield scene.frame({
      codeLine: LINE.bf,
      explanation: `${scene.label(node)}: height ${this.height(node)}, balance = h(left) - h(right) = ${this.height(scene.left(node))} - ${this.height(scene.right(node))} = ${bf}.`,
      highlights: { active: [node] },
      pointers: { node },
      phase: 'rebalance',
    });

    let root = node;
    if (bf > 1) {
      const left = scene.left(node);
      const childBalance = left === null ? 0 : this.balance(left);
      scene.countComparison();
      if (left !== null && childBalance < 0) {
        yield scene.frame({
          codeLine: LINE.caseLR,
          explanation: `Left-heavy, but the left child ${scene.label(left)} leans right (bf ${childBalance}): the LR case. A single rotation would not fix it, so first rotate the child left.`,
          highlights: { swapped: [node], comparing: [left] },
          pointers: { node },
          phase: 'rebalance',
        });
        yield* this.rotate(left, 'left');
      }
      yield scene.frame({
        codeLine: LINE.caseLL,
        explanation: `Left-heavy (bf ${bf}): rotate right at ${scene.label(node)}.`,
        highlights: { swapped: [node] },
        pointers: { node },
        phase: 'rebalance',
      });
      root = yield* this.rotate(node, 'right');
    } else if (bf < -1) {
      const right = scene.right(node);
      const childBalance = right === null ? 0 : this.balance(right);
      scene.countComparison();
      if (right !== null && childBalance > 0) {
        yield scene.frame({
          codeLine: LINE.caseRL,
          explanation: `Right-heavy, but the right child ${scene.label(right)} leans left (bf ${childBalance}): the RL case. Rotate the child right first.`,
          highlights: { swapped: [node], comparing: [right] },
          pointers: { node },
          phase: 'rebalance',
        });
        yield* this.rotate(right, 'right');
      }
      yield scene.frame({
        codeLine: LINE.caseRR,
        explanation: `Right-heavy (bf ${bf}): rotate left at ${scene.label(node)}.`,
        highlights: { swapped: [node] },
        pointers: { node },
        phase: 'rebalance',
      });
      root = yield* this.rotate(node, 'left');
    } else {
      yield scene.frame({
        codeLine: LINE.balanced,
        explanation: `|${bf}| <= 1, so ${scene.label(node)} is balanced. Return it unchanged.`,
        highlights: { sorted: [node] },
        pointers: { node },
        phase: 'rebalance',
      });
    }

    scene.popCall();
    return root;
  }

  *insert(node: string | null, key: number, parent: string | null, side: Side, phase: string): Generator<Frame, string, undefined> {
    const scene = this.scene;
    scene.countCall();
    scene.pushCall({ label: `insert(${node === null ? 'null' : scene.label(node)}, ${key})`, codeLine: LINE.insertEnter });

    if (node === null) {
      const created = scene.create(String(key), { value: key, badges: { h: 1, bf: 0 } });
      this.heights.set(created, 1);
      if (parent === null) scene.setRoot(created);
      else scene.link(parent, side, created);
      yield scene.frame({
        codeLine: LINE.insertNew,
        explanation: `Null slot reached: ${key} becomes a new leaf${parent === null ? ' and the root' : ` under ${scene.label(parent)}`}.`,
        highlights: { candidate: [created] },
        pointers: { node: created },
        phase,
      });
      scene.popCall();
      return created;
    }

    const cmp = scene.compareValue(node, key);
    if (cmp === 0) {
      yield scene.frame({
        codeLine: LINE.insertDup,
        explanation: `${key} is already here. Keys are unique, so return the node unchanged.`,
        highlights: { excluded: [node] },
        pointers: { node },
        phase,
      });
      scene.popCall();
      return node;
    }

    const goLeft = key < scene.value(node);
    yield scene.frame({
      codeLine: goLeft ? LINE.insertLeft : LINE.insertRight,
      explanation: `${key} ${goLeft ? '<' : '>'} ${scene.label(node)}: recurse ${goLeft ? 'left' : 'right'}.`,
      highlights: { comparing: [node] },
      pointers: { node },
      phase,
    });
    yield* this.insert(scene.child(node, goLeft ? LEFT : RIGHT), key, node, goLeft ? LEFT : RIGHT, phase);

    yield scene.frame({
      codeLine: LINE.insertRebalance,
      explanation: `Back at ${scene.label(node)} on the way up: re-check its balance.`,
      highlights: { active: [node] },
      pointers: { node },
      phase,
    });
    const root = yield* this.rebalance(node);
    scene.popCall();
    return root;
  }

  *remove(node: string | null, key: number, phase: string): Generator<Frame, string | null, undefined> {
    const scene = this.scene;
    scene.countCall();
    scene.pushCall({ label: `remove(${node === null ? 'null' : scene.label(node)}, ${key})`, codeLine: LINE.removeEnter });

    if (node === null) {
      yield scene.frame({
        codeLine: LINE.removeNull,
        explanation: `Fell off the tree: ${key} is not present.`,
        phase,
      });
      scene.popCall();
      return null;
    }

    const cmp = scene.compareValue(node, key);
    if (cmp !== 0) {
      const goLeft = key < scene.value(node);
      yield scene.frame({
        codeLine: goLeft ? LINE.removeLeft : LINE.removeRight,
        explanation: `${key} ${goLeft ? '<' : '>'} ${scene.label(node)}: recurse ${goLeft ? 'left' : 'right'}.`,
        highlights: { comparing: [node] },
        pointers: { node },
        phase,
      });
      const replacement = yield* this.remove(scene.child(node, goLeft ? LEFT : RIGHT), key, phase);
      if (scene.child(node, goLeft ? LEFT : RIGHT) !== replacement) scene.link(node, goLeft ? LEFT : RIGHT, replacement);

      yield scene.frame({
        codeLine: LINE.removeRebalance,
        explanation: `Back at ${scene.label(node)}: a deletion below can unbalance it just like an insertion.`,
        highlights: { active: [node] },
        pointers: { node },
        phase,
      });
      const root = yield* this.rebalance(node);
      scene.popCall();
      return root;
    }

    const left = scene.left(node);
    const right = scene.right(node);

    if (left === null || right === null) {
      const child = left ?? right;
      yield scene.frame({
        codeLine: LINE.removeOneChild,
        explanation:
          child === null
            ? `${scene.label(node)} is a leaf: unlink it.`
            : `${scene.label(node)} has one child, ${scene.label(child)}, which takes its place.`,
        highlights: { swapped: [node], ...(child === null ? {} : { candidate: [child] }) },
        pointers: { node },
        phase,
      });

      if (child !== null) scene.link(node, left !== null ? LEFT : RIGHT, null);
      scene.replaceChild(node, child);
      scene.destroy(node);
      this.forget(node);
      scene.bump('deletions');
      yield scene.frame({
        codeLine: LINE.removeSplice,
        explanation: `${key} is gone. ${child === null ? 'The slot is null now.' : `${scene.label(child)} moved up one level.`}`,
        highlights: child === null ? {} : { candidate: [child] },
        phase,
      });
      scene.popCall();
      return child;
    }

    yield scene.frame({
      codeLine: LINE.removeSucc,
      explanation: `${scene.label(node)} has two children: find the in-order successor, the leftmost node of the right subtree.`,
      highlights: { swapped: [node], active: [left, right] },
      pointers: { node },
      phase,
    });

    let succ = right;
    scene.visit(succ);
    while (scene.left(succ) !== null) {
      const next = scene.left(succ);
      if (next === null) break;
      scene.visit(next);
      succ = next;
    }
    const succKey = scene.value(succ);
    yield scene.frame({
      codeLine: LINE.removeSucc,
      explanation: `Successor is ${succKey}.`,
      highlights: { swapped: [node], pivot: [succ] },
      pointers: { node, succ },
      phase,
    });

    scene.setValue(node, succKey);
    yield scene.frame({
      codeLine: LINE.removeCopy,
      explanation: `Copy ${succKey} into the node, then delete ${succKey} from the right subtree instead.`,
      highlights: { pivot: [node], swapped: [succ] },
      pointers: { node, succ },
      phase,
    });

    yield scene.frame({
      codeLine: LINE.removeRecurse,
      explanation: `remove(${scene.label(right)}, ${succKey}): the successor has no left child, so this hits the easy case.`,
      highlights: { comparing: [right] },
      pointers: { node },
      phase,
    });
    const replacement = yield* this.remove(right, succKey, phase);
    if (scene.right(node) !== replacement) scene.link(node, RIGHT, replacement);

    yield scene.frame({
      codeLine: LINE.removeRebalance,
      explanation: `Back at ${scene.label(node)}: re-check balance after the subtree shrank.`,
      highlights: { active: [node] },
      pointers: { node },
      phase,
    });
    const root = yield* this.rebalance(node);
    scene.popCall();
    return root;
  }
}

function parse(params: ParamMap): ParseResult<AvlInput> {
  const keys = parseTreeKeys(params.input ?? '');
  if (!keys.ok) return keys;
  const ops = parseKeyOps(params.ops ?? '', ['insert', 'delete']);
  if (!ops.ok) return ops;
  if (keys.value.length === 0 && ops.value.length === 0) {
    return { ok: false, error: 'Give at least one initial key or one operation.' };
  }
  return { ok: true, value: { keys: keys.value, ops: ops.value } };
}

const lowKeyPreset: PresetSpec = {
  id: 'low-key',
  label: 'Insert low key',
  build: (size, rng) => {
    const keys = distinctKeys(size, rng, 20, 99).sort((a, b) => a - b);
    const present = new Set(keys);
    let middle = 60;
    while (present.has(middle)) middle += 1;
    return {
      input: medianFirst(keys).join(', '),
      ops: `insert ${randomInt(rng, 1, 9)}; insert ${middle}; insert ${randomInt(rng, 10, 19)}`,
      seed: String(randomInt(rng, 0, 999999)),
    };
  },
};

export const avl = defineAlgorithm<AvlInput>({
  meta: {
    id: 'avl',
    name: 'AVL tree',
    category: 'trees',
    structureKind: 'tree',
    blurb: 'Height-balanced BST with animated LL / LR / RL / RR rotations.',
    complexity: {
      time: { best: 'O(log n)', average: 'O(log n)', worst: 'O(log n)' },
      space: 'O(n)',
      notes: [
        'Height is at most 1.44 log2(n), so every operation is O(log n) even on adversarial input. Try the "Sorted" preset: where a BST degenerates, this stays a tree.',
        'Insert needs at most one rotation (single or double). Delete can need one at every level on the way up.',
        'A rotation never moves a node sideways in this layout, because in-order is exactly what a rotation preserves.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'reads', 'writes', 'recursiveCalls'],
  },
  fields: [
    { ...keysField, defaultValue: '10, 20, 30, 40, 50, 25' },
    opsField('insert 5; insert 4; delete 40; delete 50', ['insert', 'delete']),
    seedField,
  ],
  presets: [...treePresets(['insert', 'delete']), lowKeyPreset],
  sizeRange: { min: 1, max: 40, step: 1 },
  parse,
  *run(input) {
    const avlTree = new Avl();
    const { scene } = avlTree;

    const beat = (what: string, phase: string): Frame =>
      scene.frame({
        codeLine: 0,
        explanation: `After ${what}: ${scene.size} nodes, height ${scene.height(scene.root) + 1}, every |bf| <= 1.`,
        phase,
      });

    if (input.keys.length > 0) {
      yield scene.frame({
        codeLine: LINE.insertEnter,
        explanation: `Insert ${input.keys.length} keys in order: ${input.keys.join(', ')}. Each node shows h (height) and bf (balance).`,
        phase: 'build',
      });
      for (const key of input.keys) {
        const root = yield* avlTree.insert(scene.root, key, null, LEFT, 'build');
        if (scene.root !== root) scene.setRoot(root);
        yield beat(`insert ${key}`, 'build');
      }
    }

    for (const op of input.ops) {
      if (op.kind === 'insert') {
        const root = yield* avlTree.insert(scene.root, op.key, null, LEFT, 'insert');
        if (scene.root !== root) scene.setRoot(root);
      } else {
        const root = yield* avlTree.remove(scene.root, op.key, 'delete');
        if (scene.root !== root) scene.setRoot(root);
      }
      yield beat(`${op.kind} ${op.key}`, op.kind);
    }

    const counters = scene.counters();
    yield scene.frame({
      codeLine: 0,
      explanation: `Done: ${scene.size} nodes, height ${scene.height(scene.root) + 1}, ${counters.extra.rotations ?? 0} rotation(s). Log2 bound: ${(1.44 * Math.log2(Math.max(2, scene.size + 1))).toFixed(1)}.`,
      phase: 'done',
    });
  },
});
