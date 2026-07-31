/**
 * Tree traversals: pre-, in-, post- and level-order, with the call stack (or
 * the queue) on screen.
 */

import { seedField } from '../../core/arrayInput';
import { defineAlgorithm, type FieldSpec, type ParamMap, type ParseResult } from '../../core/define';
import { LEFT, RIGHT, TreeScene } from '../../core/treeScene';
import { keysField, parseTreeKeys, treePresets } from '../../core/treeInput';
import type { Frame, TreeStrip } from '../../core/types';

const ORDERS = ['preorder', 'inorder', 'postorder', 'levelorder'] as const;
type Order = (typeof ORDERS)[number];

interface TraversalInput {
  readonly keys: readonly number[];
  readonly order: Order;
}

const CODE = `function preorder(node: Node | null): void {
  if (node === null) return;
  visit(node);                                   // root, left, right
  preorder(node.left);
  preorder(node.right);
}

function inorder(node: Node | null): void {
  if (node === null) return;
  inorder(node.left);
  visit(node);                                   // left, root, right: sorted for a BST
  inorder(node.right);
}

function postorder(node: Node | null): void {
  if (node === null) return;
  postorder(node.left);
  postorder(node.right);
  visit(node);                                   // left, right, root: children first
}

function levelorder(root: Node): void {
  const queue = [root];
  while (queue.length > 0) {
    const node = queue.shift();                  // FIFO: finish a level before the next
    visit(node);
    if (node.left !== null)  queue.push(node.left);
    if (node.right !== null) queue.push(node.right);
  }
}`;

const LINES: Record<Order, { enter: number; base: number; left: number; visit: number; right: number }> = {
  preorder: { enter: 1, base: 2, visit: 3, left: 4, right: 5 },
  inorder: { enter: 8, base: 9, left: 10, visit: 11, right: 12 },
  postorder: { enter: 15, base: 16, left: 17, right: 18, visit: 19 },
  levelorder: { enter: 22, base: 23, left: 27, visit: 26, right: 28 },
};
const LEVEL = { init: 23, loop: 24, shift: 25, visit: 26, pushLeft: 27, pushRight: 28 } as const;

type Gen = Generator<Frame, void, undefined>;

function outputStrip(scene: TreeScene, visited: readonly string[]): TreeStrip {
  return { label: 'output', kind: 'output', items: visited.map((id) => ({ id, label: scene.label(id) })) };
}

function queueStrip(scene: TreeScene, queue: readonly string[]): TreeStrip {
  return { label: 'queue', kind: 'queue', items: queue.map((id) => ({ id, label: scene.label(id) })) };
}

function* recursive(scene: TreeScene, order: Exclude<Order, 'levelorder'>, node: string | null, visited: string[], label: string): Gen {
  const lines = LINES[order];
  scene.countCall();
  scene.pushCall({ label: `${order}(${node === null ? 'null' : scene.label(node)})`, codeLine: lines.enter });

  if (node === null) {
    yield scene.frame({
      codeLine: lines.base,
      explanation: `${label} is null: return immediately. Every leaf makes two of these calls.`,
      strips: [outputStrip(scene, visited)],
      phase: order,
    });
    scene.popCall();
    return;
  }

  const visit = function* (): Gen {
    scene.visit(node);
    visited.push(node);
    yield scene.frame({
      codeLine: lines.visit,
      explanation: `visit(${scene.label(node)}): output position ${visited.length}.`,
      highlights: { sorted: [...visited], comparing: [node] },
      pointers: { node },
      strips: [outputStrip(scene, visited)],
      phase: order,
    });
  };

  const recurse = function* (side: typeof LEFT | typeof RIGHT): Gen {
    const child = scene.child(node, side);
    yield scene.frame({
      codeLine: side === LEFT ? lines.left : lines.right,
      explanation: `${order}(${scene.label(node)}.${side === LEFT ? 'left' : 'right'})${child === null ? ', which is null' : ` = ${scene.label(child)}`}.`,
      highlights: { sorted: [...visited], active: [node], ...(child === null ? {} : { candidate: [child] }) },
      pointers: { node },
      strips: [outputStrip(scene, visited)],
      phase: order,
    });
    yield* recursive(scene, order, child, visited, `${scene.label(node)}.${side === LEFT ? 'left' : 'right'}`);
  };

  yield scene.frame({
    codeLine: lines.enter,
    explanation: `${order}(${scene.label(node)}), depth ${scene.depth - 1}.`,
    highlights: { sorted: [...visited], active: [node] },
    pointers: { node },
    strips: [outputStrip(scene, visited)],
    phase: order,
  });

  if (order === 'preorder') {
    yield* visit();
    yield* recurse(LEFT);
    yield* recurse(RIGHT);
  } else if (order === 'inorder') {
    yield* recurse(LEFT);
    yield* visit();
    yield* recurse(RIGHT);
  } else {
    yield* recurse(LEFT);
    yield* recurse(RIGHT);
    yield* visit();
  }
  scene.popCall();
}

function* levelorder(scene: TreeScene, visited: string[]): Gen {
  const root = scene.root;
  if (root === null) return;
  const queue: string[] = [root];

  yield scene.frame({
    codeLine: LEVEL.init,
    explanation: `Seed the queue with the root. A queue, not a stack: that is the entire difference from depth-first.`,
    highlights: { active: [root] },
    strips: [queueStrip(scene, queue), outputStrip(scene, visited)],
    phase: 'levelorder',
  });

  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined) break;
    scene.visit(node);
    yield scene.frame({
      codeLine: LEVEL.shift,
      explanation: `Dequeue ${scene.label(node)} from the front.`,
      highlights: { sorted: [...visited], comparing: [node] },
      pointers: { node },
      strips: [queueStrip(scene, queue), outputStrip(scene, visited)],
      phase: 'levelorder',
    });

    visited.push(node);
    yield scene.frame({
      codeLine: LEVEL.visit,
      explanation: `visit(${scene.label(node)}): output position ${visited.length}.`,
      highlights: { sorted: [...visited] },
      pointers: { node },
      strips: [queueStrip(scene, queue), outputStrip(scene, visited)],
      phase: 'levelorder',
    });

    for (const side of [LEFT, RIGHT] as const) {
      const child = scene.child(node, side);
      if (child === null) continue;
      queue.push(child);
      yield scene.frame({
        codeLine: side === LEFT ? LEVEL.pushLeft : LEVEL.pushRight,
        explanation: `Enqueue ${scene.label(child)} at the back; it will be visited after everything already waiting.`,
        highlights: { sorted: [...visited], candidate: [child, `queue:${child}`] },
        pointers: { node },
        strips: [queueStrip(scene, queue), outputStrip(scene, visited)],
        phase: 'levelorder',
      });
    }
  }

  yield scene.frame({
    codeLine: LEVEL.loop,
    explanation: `Queue empty: ${visited.length} nodes visited level by level.`,
    highlights: { sorted: [...visited] },
    strips: [queueStrip(scene, queue), outputStrip(scene, visited)],
    phase: 'levelorder',
  });
}

function buildBst(scene: TreeScene, keys: readonly number[]): void {
  for (const key of keys) {
    const node = scene.create(String(key), { value: key });
    if (scene.root === null) {
      scene.setRoot(node);
      continue;
    }
    let cur = scene.root;
    for (;;) {
      const side = key < scene.value(cur) ? LEFT : RIGHT;
      const next = scene.child(cur, side);
      if (next === null) {
        scene.link(cur, side, node);
        break;
      }
      cur = next;
    }
  }
}

function parse(params: ParamMap): ParseResult<TraversalInput> {
  const keys = parseTreeKeys(params.input ?? '', 40);
  if (!keys.ok) return keys;
  if (keys.value.length === 0) return { ok: false, error: 'Give at least one key.' };
  const order = ORDERS.find((candidate) => candidate === (params.order ?? 'inorder'));
  if (order === undefined) return { ok: false, error: `Unknown order "${params.order ?? ''}".` };
  return { ok: true, value: { keys: keys.value, order } };
}

const orderField: FieldSpec = {
  key: 'order',
  label: 'Order',
  kind: 'select',
  defaultValue: 'inorder',
  options: [
    { value: 'preorder', label: 'Pre-order (root, left, right)' },
    { value: 'inorder', label: 'In-order (left, root, right)' },
    { value: 'postorder', label: 'Post-order (left, right, root)' },
    { value: 'levelorder', label: 'Level-order (BFS with a queue)' },
  ],
  help: 'The recursive orders differ only in when visit() is called.',
};

export const treeTraversals = defineAlgorithm<TraversalInput>({
  meta: {
    id: 'tree-traversals',
    name: 'Tree traversals',
    category: 'trees',
    structureKind: 'tree',
    blurb: 'Pre-, in-, post- and level-order with the call stack on screen.',
    complexity: {
      time: { best: 'O(n)', average: 'O(n)', worst: 'O(n)' },
      space: 'O(h)',
      notes: [
        'Every traversal touches each node once, so time is O(n) regardless of shape. Space is the height of the tree for the recursive orders (the call stack) and the widest level for BFS (the queue).',
        'In-order on a BST yields the keys sorted - that is the definition of a BST, read out loud.',
        'Post-order is the one that frees or evaluates children before the parent: deleting a tree, computing subtree sizes, evaluating expression trees.',
      ],
    },
    code: CODE,
    trackedCounters: ['reads', 'recursiveCalls'],
  },
  fields: [{ ...keysField, defaultValue: '50, 30, 70, 20, 40, 60, 80, 35, 45' }, orderField, seedField],
  presets: treePresets([]),
  sizeRange: { min: 1, max: 31, step: 1 },
  parse,
  *run(input) {
    const scene = new TreeScene('binary');
    buildBst(scene, input.keys);

    yield scene.frame({
      codeLine: LINES[input.order].enter,
      explanation: `A BST of ${scene.size} keys, height ${scene.height(scene.root) + 1}. Traverse it in ${input.order}.`,
      strips: input.order === 'levelorder' ? [queueStrip(scene, []), outputStrip(scene, [])] : [outputStrip(scene, [])],
      phase: input.order,
    });

    const visited: string[] = [];
    if (input.order === 'levelorder') yield* levelorder(scene, visited);
    else yield* recursive(scene, input.order, scene.root, visited, 'root');

    yield scene.frame({
      codeLine: 0,
      explanation:
        input.order === 'inorder'
          ? `Done. In-order on a BST is the sorted key sequence, every time.`
          : `Done: ${scene.size} nodes visited, ${scene.counters().recursiveCalls} calls including the null ones.`,
      highlights: { sorted: scene.subtree(scene.root) },
      strips: [outputStrip(scene, visited)],
      phase: 'done',
    });
  },
});
