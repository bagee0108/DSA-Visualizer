/** Binary search tree: insert, delete, search. */

import { defineAlgorithm, type ParamMap, type ParseResult } from '../../core/define';
import { seedField } from '../../core/arrayInput';
import { LEFT, RIGHT, TreeScene, type Side } from '../../core/treeScene';
import { keysField, opsField, parseKeyOps, parseTreeKeys, treePresets, type KeyOp } from '../../core/treeInput';
import type { Frame } from '../../core/types';

interface BstInput {
  readonly keys: readonly number[];
  readonly ops: readonly KeyOp[];
}

const CODE = `function search(root: Node | null, key: number): Node | null {
  let cur = root;
  while (cur !== null) {
    if (key === cur.key) return cur;             // hit
    cur = key < cur.key ? cur.left : cur.right;  // go the one way it can be
  }
  return null;                                   // fell off the tree
}

function insert(root: Node | null, key: number): Node {
  let parent: Node | null = null, cur = root;
  while (cur !== null) {                         // walk down to a null slot
    parent = cur;
    cur = key < cur.key ? cur.left : cur.right;
  }
  const node = new Node(key);
  if (parent === null) return node;              // empty tree: new root
  if (key < parent.key) parent.left = node;
  else                  parent.right = node;
  return root;
}

function remove(node: Node): void {
  if (node.left !== null && node.right !== null) {
    const succ = min(node.right);                // in-order successor
    node.key = succ.key;                         // overwrite, then delete
    node = succ;                                 //   the successor instead
  }
  const child = node.left ?? node.right;         // 0 or 1 child: splice out
  replaceInParent(node, child);
}`;

const LINE = {
  searchEnter: 1,
  searchLoop: 3,
  searchHit: 4,
  searchStep: 5,
  searchMiss: 7,
  insertEnter: 10,
  insertLoop: 12,
  insertStep: 14,
  insertNew: 16,
  insertRoot: 17,
  insertLeft: 18,
  insertRight: 19,
  removeEnter: 23,
  removeTwo: 24,
  removeSucc: 25,
  removeCopy: 26,
  removeRetarget: 27,
  removeChild: 29,
  removeSplice: 30,
} as const;

type Gen = Generator<Frame, void, undefined>;

function* descend(
  scene: TreeScene,
  key: number,
  lines: { loop: number; step: number },
  phase: string,
): Generator<Frame, { found: string | null; parent: string | null; side: Side }, undefined> {
  let cur = scene.root;
  let parent: string | null = null;
  let side: Side = LEFT;
  const path: string[] = [];

  while (cur !== null) {
    const cmp = scene.compareValue(cur, key);
    const value = scene.value(cur);
    if (cmp === 0) {
      yield scene.frame({
        codeLine: lines.loop,
        explanation: `${key} equals the key at this node - found it after ${path.length + 1} comparison(s).`,
        highlights: { sorted: [cur], visited: [...path] },
        pointers: { cur },
        phase,
      });
      return { found: cur, parent, side };
    }

    const goLeft = key < value;
    yield scene.frame({
      codeLine: lines.step,
      explanation: `${key} ${goLeft ? '<' : '>'} ${value}, so it can only be in the ${goLeft ? 'left' : 'right'} subtree.`,
      highlights: { comparing: [cur], visited: [...path] },
      pointers: { cur },
      phase,
    });

    path.push(cur);
    parent = cur;
    side = goLeft ? LEFT : RIGHT;
    cur = scene.child(cur, side);
  }

  return { found: null, parent, side };
}

function* search(scene: TreeScene, key: number): Gen {
  scene.pushCall({ label: `search(${key})`, codeLine: LINE.searchEnter });
  yield scene.frame({
    codeLine: LINE.searchEnter,
    explanation: `search(${key}): start at the root and go one way at each node.`,
    phase: 'search',
  });

  const result = yield* descend(scene, key, { loop: LINE.searchHit, step: LINE.searchStep }, 'search');
  if (result.found === null) {
    yield scene.frame({
      codeLine: LINE.searchMiss,
      explanation: `Reached a null child below ${result.parent === null ? 'the root' : scene.label(result.parent)}: ${key} is not in the tree.`,
      highlights: result.parent === null ? {} : { excluded: [result.parent] },
      phase: 'search',
    });
  }
  scene.popCall();
}

function* insert(scene: TreeScene, key: number, phase: string): Gen {
  scene.pushCall({ label: `insert(${key})`, codeLine: LINE.insertEnter });
  yield scene.frame({
    codeLine: LINE.insertEnter,
    explanation: `insert(${key}): search for where it would be, then hang it there.`,
    phase,
  });

  const result = yield* descend(scene, key, { loop: LINE.insertLoop, step: LINE.insertStep }, phase);
  if (result.found !== null) {
    yield scene.frame({
      codeLine: LINE.insertLoop,
      explanation: `${key} is already present. BST keys are unique, so this insert is a no-op.`,
      highlights: { excluded: [result.found] },
      phase,
    });
  } else {
    const node = scene.create(String(key), { value: key });
    if (result.parent === null) {
      scene.setRoot(node);
      yield scene.frame({
        codeLine: LINE.insertRoot,
        explanation: `The tree was empty, so ${key} becomes the root.`,
        highlights: { candidate: [node] },
        pointers: { node },
        phase,
      });
    } else {
      scene.link(result.parent, result.side, node);
      yield scene.frame({
        codeLine: result.side === LEFT ? LINE.insertLeft : LINE.insertRight,
        explanation: `The ${result.side === LEFT ? 'left' : 'right'} child of ${scene.label(result.parent)} was null, so ${key} goes there, at depth ${depthOf(scene, node)}.`,
        highlights: { candidate: [node], active: [result.parent] },
        pointers: { node, parent: result.parent },
        phase,
      });
    }
  }
  scene.popCall();
}

function depthOf(scene: TreeScene, id: string): number {
  let depth = 0;
  let cur = scene.parent(id);
  while (cur !== null) {
    depth += 1;
    cur = scene.parent(cur);
  }
  return depth;
}

function* remove(scene: TreeScene, key: number): Gen {
  scene.pushCall({ label: `remove(${key})`, codeLine: LINE.removeEnter });
  yield scene.frame({
    codeLine: LINE.removeEnter,
    explanation: `delete(${key}): find it first.`,
    phase: 'delete',
  });

  const result = yield* descend(scene, key, { loop: LINE.searchHit, step: LINE.searchStep }, 'delete');
  if (result.found === null) {
    yield scene.frame({
      codeLine: LINE.searchMiss,
      explanation: `${key} is not in the tree; nothing to delete.`,
      phase: 'delete',
    });
    scene.popCall();
    return;
  }

  let target = result.found;
  const left = scene.left(target);
  const right = scene.right(target);

  if (left !== null && right !== null) {
    yield scene.frame({
      codeLine: LINE.removeTwo,
      explanation: `${key} has two children, so it cannot simply be unlinked. Find its in-order successor: the smallest key in the right subtree.`,
      highlights: { swapped: [target], active: [left, right] },
      pointers: { node: target },
      phase: 'delete',
    });

    let succ = right;
    scene.visit(succ);
    while (scene.left(succ) !== null) {
      const next = scene.left(succ);
      if (next === null) break;
      yield scene.frame({
        codeLine: LINE.removeSucc,
        explanation: `${scene.label(succ)} still has a left child, so keep going left.`,
        highlights: { swapped: [target], comparing: [succ] },
        pointers: { node: target, succ },
        phase: 'delete',
      });
      scene.visit(next);
      succ = next;
    }

    const succKey = scene.value(succ);
    yield scene.frame({
      codeLine: LINE.removeSucc,
      explanation: `The successor is ${succKey}: the very next key in order, and it has no left child by construction.`,
      highlights: { swapped: [target], pivot: [succ] },
      pointers: { node: target, succ },
      phase: 'delete',
    });

    scene.setValue(target, succKey);
    yield scene.frame({
      codeLine: LINE.removeCopy,
      explanation: `Overwrite ${key} with ${succKey}. In-order is intact because ${succKey} was already the next key.`,
      highlights: { pivot: [target], swapped: [succ] },
      pointers: { node: target, succ },
      phase: 'delete',
    });

    target = succ;
    yield scene.frame({
      codeLine: LINE.removeRetarget,
      explanation: `Now delete the successor node instead. It has at most one child, so that is the easy case.`,
      highlights: { swapped: [target] },
      pointers: { node: target },
      phase: 'delete',
    });
  }

  const child = scene.left(target) ?? scene.right(target);
  yield scene.frame({
    codeLine: LINE.removeChild,
    explanation:
      child === null
        ? `${scene.label(target)} is a leaf: just unlink it.`
        : `${scene.label(target)} has one child, ${scene.label(child)}, which takes its place.`,
    highlights: { swapped: [target], ...(child === null ? {} : { candidate: [child] }) },
    pointers: { node: target },
    phase: 'delete',
  });

  const parent = scene.parent(target);
  scene.replaceChild(target, child);
  if (child !== null) {
    const side = scene.left(target) === child ? LEFT : RIGHT;
    scene.link(target, side, null);
  }
  scene.destroy(target);
  scene.bump('deletions');

  yield scene.frame({
    codeLine: LINE.removeSplice,
    explanation: `Spliced out. ${child === null ? 'The parent slot is null now' : `${scene.label(child)} hangs from ${parent === null ? 'the root position' : scene.label(parent)} now`}. Keys in order: ${scene.inorder().join(' ')}.`,
    highlights: child === null ? {} : { candidate: [child] },
    phase: 'delete',
  });
  scene.popCall();
}

function parse(params: ParamMap): ParseResult<BstInput> {
  const keys = parseTreeKeys(params.input ?? '');
  if (!keys.ok) return keys;
  const ops = parseKeyOps(params.ops ?? '', ['insert', 'delete', 'search']);
  if (!ops.ok) return ops;
  if (keys.value.length === 0 && ops.value.length === 0) {
    return { ok: false, error: 'Give at least one initial key or one operation.' };
  }
  return { ok: true, value: { keys: keys.value, ops: ops.value } };
}

export const bst = defineAlgorithm<BstInput>({
  meta: {
    id: 'bst',
    name: 'BST insert / delete / search',
    category: 'trees',
    structureKind: 'tree',
    blurb: 'The unbalanced baseline, including the two-child delete case.',
    complexity: {
      time: { best: 'O(log n)', average: 'O(log n)', worst: 'O(n)' },
      space: 'O(n)',
      notes: [
        'Every operation costs the depth of the node it touches, so a sorted insertion order degrades the tree to a linked list. Try the "Sorted" preset.',
        'Two-child delete never moves the target node: it copies the successor key down and splices the successor out.',
        'Nodes are placed at their in-order rank, which is why the tree always reads sorted left to right.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'reads', 'writes'],
  },
  fields: [keysField, opsField('insert 55; search 45; delete 30; delete 50', ['insert', 'delete', 'search']), seedField],
  presets: treePresets(['insert', 'delete', 'search']),
  sizeRange: { min: 1, max: 60, step: 1 },
  parse,
  *run(input) {
    const scene = new TreeScene('binary');

    if (input.keys.length > 0) {
      yield scene.frame({
        codeLine: LINE.insertEnter,
        explanation: `Build the tree by inserting ${input.keys.length} keys in the given order: ${input.keys.join(', ')}.`,
        phase: 'build',
      });
      for (const key of input.keys) {
        yield* insert(scene, key, 'build');
        yield scene.frame({
          codeLine: 0,
          explanation: `After insert ${key}: ${scene.size} nodes, height ${scene.height(scene.root) + 1}.`,
          phase: 'build',
        });
      }
      yield scene.frame({
        codeLine: 0,
        explanation: `Built: ${scene.size} nodes, height ${scene.height(scene.root)}. A perfect tree of this size would have height ${Math.floor(Math.log2(Math.max(1, scene.size)))}.`,
        phase: 'build',
      });
    }

    for (const op of input.ops) {
      if (op.kind === 'insert') yield* insert(scene, op.key, 'insert');
      else if (op.kind === 'delete') yield* remove(scene, op.key);
      else yield* search(scene, op.key);
      yield scene.frame({
        codeLine: 0,
        explanation: `After ${op.kind} ${op.key}: ${scene.size} nodes, height ${scene.height(scene.root) + 1}.`,
        phase: op.kind,
      });
    }

    const counters = scene.counters();
    yield scene.frame({
      codeLine: 0,
      explanation: `Done. ${scene.size} nodes, height ${scene.height(scene.root)}, ${counters.comparisons} comparisons in total.`,
      phase: 'done',
    });
  },
});
