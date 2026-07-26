/** Red-black tree insertion with the CLRS fixup. */

import { seedField } from '../../core/arrayInput';
import { defineAlgorithm, type ParamMap, type ParseResult } from '../../core/define';
import { LEFT, RIGHT, TreeScene, type Side } from '../../core/treeScene';
import { keysField, opsField, parseKeyOps, parseTreeKeys, treePresets, type KeyOp } from '../../core/treeInput';
import type { Frame } from '../../core/types';

interface RedBlackInput {
  readonly keys: readonly number[];
  readonly ops: readonly KeyOp[];
}

const CODE = `function insert(key: number): void {
  const z = new Node(key, RED);                  // new nodes start red
  bstInsert(z);                                  // ordinary BST descent
  fixup(z);
}

function fixup(z: Node): void {
  while (z.parent !== null && z.parent.color === RED) {
    const p = z.parent, g = p.parent;            // red parent => g exists and is black
    const uncle = p === g.left ? g.right : g.left;
    if (uncle !== null && uncle.color === RED) {
      p.color = BLACK; uncle.color = BLACK;      // case 1: recolour, then
      g.color = RED;                             //   push the problem up
      z = g;
    } else {
      if (z === (p === g.left ? p.right : p.left)) {
        z = p; rotate(z, towardsInside);         // case 2: straighten the zig-zag
      }
      z.parent.color = BLACK;                    // case 3: recolour and rotate
      g.color = RED;                             //   the grandparent down
      rotate(g, awayFrom(z));
    }
  }
  root.color = BLACK;                            // the root is always black
}`;

const LINE = {
  insertEnter: 1,
  newNode: 2,
  bstInsert: 3,
  callFixup: 4,
  fixupEnter: 7,
  loop: 8,
  family: 9,
  uncle: 10,
  case1Test: 11,
  case1Recolour: 12,
  case1Push: 14,
  case2Test: 16,
  case2Rotate: 17,
  case3Recolour: 19,
  case3Rotate: 21,
  rootBlack: 24,
} as const;

type Gen = Generator<Frame, void, undefined>;

function* bstDescend(scene: TreeScene, key: number, phase: string): Generator<Frame, { parent: string | null; side: Side; duplicate: string | null }, undefined> {
  let cur = scene.root;
  let parent: string | null = null;
  let side: Side = LEFT;
  const path: string[] = [];

  while (cur !== null) {
    const cmp = scene.compareValue(cur, key);
    if (cmp === 0) return { parent, side, duplicate: cur };
    const goLeft = key < scene.value(cur);
    yield scene.frame({
      codeLine: LINE.bstInsert,
      explanation: `${key} ${goLeft ? '<' : '>'} ${scene.label(cur)}: go ${goLeft ? 'left' : 'right'}.`,
      highlights: { comparing: [cur], visited: [...path] },
      pointers: { cur },
      phase,
    });
    path.push(cur);
    parent = cur;
    side = goLeft ? LEFT : RIGHT;
    cur = scene.child(cur, side);
  }
  return { parent, side, duplicate: null };
}

function* rotateWithFrames(scene: TreeScene, x: string, direction: 'left' | 'right', line: number, why: string, phase: string): Gen {
  const before = scene.child(x, direction === 'left' ? RIGHT : LEFT);
  yield scene.frame({
    codeLine: line,
    explanation: `${why} Rotate ${direction} at ${scene.label(x)}${before === null ? '' : `, lifting ${scene.label(before)}`}.`,
    highlights: { swapped: [x], ...(before === null ? {} : { pivot: [before] }) },
    pointers: { x },
    phase,
  });
  const { y, crossing } = scene.rotate(x, direction);
  yield scene.frame({
    codeLine: line,
    explanation: `${scene.label(y)} is the parent now and ${scene.label(x)} hangs off it${crossing === null ? '' : `; ${scene.label(crossing)} crossed over`}. In-order is unchanged.`,
    highlights: { swapped: [x], pivot: [y], ...(crossing === null ? {} : { candidate: [crossing] }) },
    pointers: { x, y },
    phase,
  });
}

function* fixup(scene: TreeScene, start: string, phase: string): Gen {
  let z = start;
  scene.pushCall({ label: `fixup(${scene.label(z)})`, codeLine: LINE.fixupEnter });

  for (;;) {
    const p = scene.parent(z);
    scene.countComparison();
    if (p === null || scene.color(p) !== 'red') {
      yield scene.frame({
        codeLine: LINE.loop,
        explanation:
          p === null
            ? `${scene.label(z)} is the root, so the loop ends.`
            : `Parent ${scene.label(p)} is black, so a red ${scene.label(z)} under it breaks nothing. The loop ends.`,
        highlights: { sorted: [z] },
        pointers: { z },
        phase,
      });
      break;
    }

    const g = scene.parent(p);
    if (g === null) break;
    const pSide = scene.sideOf(p) ?? LEFT;
    const uncle = scene.child(g, pSide === LEFT ? RIGHT : LEFT);
    yield scene.frame({
      codeLine: LINE.uncle,
      explanation: `Red ${scene.label(z)} under red ${scene.label(p)} violates the no-red-red rule. Grandparent ${scene.label(g)} is black. The uncle is ${uncle === null ? 'null (black)' : `${scene.label(uncle)} (${scene.color(uncle)})`}.`,
      highlights: { comparing: [z, p], active: [g], ...(uncle === null ? {} : { candidate: [uncle] }) },
      pointers: { z, p, g, ...(uncle === null ? {} : { u: uncle }) },
      phase,
    });

    scene.countComparison();
    if (uncle !== null && scene.color(uncle) === 'red') {
      scene.setColor(p, 'black');
      scene.setColor(uncle, 'black');
      scene.setColor(g, 'red');
      scene.bump('recolours');
      yield scene.frame({
        codeLine: LINE.case1Recolour,
        explanation: `Case 1, red uncle: paint ${scene.label(p)} and ${scene.label(uncle)} black and ${scene.label(g)} red. Every path through ${scene.label(g)} keeps its black count.`,
        highlights: { swapped: [p, uncle], pivot: [g] },
        pointers: { z, p, g, u: uncle },
        phase,
      });
      z = g;
      yield scene.frame({
        codeLine: LINE.case1Push,
        explanation: `${scene.label(z)} is red now and may clash with its own parent, so continue from there.`,
        highlights: { comparing: [z] },
        pointers: { z },
        phase,
      });
      continue;
    }

    const zSide = scene.sideOf(z);
    scene.countComparison();
    if (zSide !== null && zSide !== pSide) {
      yield scene.frame({
        codeLine: LINE.case2Test,
        explanation: `Case 2: ${scene.label(z)} is an inner grandchild (a zig-zag through ${scene.label(p)}). A single rotation at ${scene.label(g)} would not fix that shape.`,
        highlights: { comparing: [z], active: [p], pivot: [g] },
        pointers: { z, p, g },
        phase,
      });
      const oldP = p;
      z = p;
      yield* rotateWithFrames(scene, oldP, pSide === LEFT ? 'left' : 'right', LINE.case2Rotate, `Straighten it:`, phase);
    }

    const parentNow = scene.parent(z);
    const grand = parentNow === null ? null : scene.parent(parentNow);
    if (parentNow === null || grand === null) break;

    scene.setColor(parentNow, 'black');
    scene.setColor(grand, 'red');
    scene.bump('recolours');
    yield scene.frame({
      codeLine: LINE.case3Recolour,
      explanation: `Case 3: paint ${scene.label(parentNow)} black and ${scene.label(grand)} red, then rotate ${scene.label(grand)} down so the black node ends up on top.`,
      highlights: { swapped: [parentNow], pivot: [grand], comparing: [z] },
      pointers: { z, p: parentNow, g: grand },
      phase,
    });
    const zSideNow = scene.sideOf(z) ?? LEFT;
    yield* rotateWithFrames(scene, grand, zSideNow === LEFT ? 'right' : 'left', LINE.case3Rotate, `Finish case 3.`, phase);
  }

  const root = scene.root;
  if (root !== null && scene.color(root) !== 'black') {
    scene.setColor(root, 'black');
    yield scene.frame({
      codeLine: LINE.rootBlack,
      explanation: `The root is always black; painting it costs nothing, since every path goes through it.`,
      highlights: { active: [root] },
      pointers: { root },
      phase,
    });
  }
  scene.popCall();
}

function* insert(scene: TreeScene, key: number, phase: string): Gen {
  scene.pushCall({ label: `insert(${key})`, codeLine: LINE.insertEnter });
  yield scene.frame({
    codeLine: LINE.insertEnter,
    explanation: `insert(${key}): a plain BST insert, then fix any red-red violation walking up.`,
    phase,
  });

  const { parent, side, duplicate } = yield* bstDescend(scene, key, phase);
  if (duplicate !== null) {
    yield scene.frame({
      codeLine: LINE.bstInsert,
      explanation: `${key} is already in the tree; nothing changes.`,
      highlights: { excluded: [duplicate] },
      phase,
    });
    scene.popCall();
    return;
  }

  const z = scene.create(String(key), { value: key, color: 'red' });
  if (parent === null) scene.setRoot(z);
  else scene.link(parent, side, z);
  yield scene.frame({
    codeLine: LINE.newNode,
    explanation: `${key} joins as a red leaf${parent === null ? ' at the root' : ` under ${scene.label(parent)}`}. Red, because adding a black node would change a black-height and that is the harder invariant to repair.`,
    highlights: { candidate: [z] },
    pointers: { z },
    phase,
  });

  yield scene.frame({
    codeLine: LINE.callFixup,
    explanation: `fixup(${key}).`,
    highlights: { candidate: [z] },
    pointers: { z },
    phase,
  });
  yield* fixup(scene, z, phase);
  scene.popCall();
}

function beat(scene: TreeScene, key: number, phase: string): Frame {
  return scene.frame({
    codeLine: 0,
    explanation: `After insert ${key}: ${scene.size} nodes, height ${scene.height(scene.root) + 1}, black-height ${blackHeight(scene, scene.root)}.`,
    phase,
  });
}

export function blackHeight(scene: TreeScene, id: string | null): number {
  if (id === null) return 1;
  const left = blackHeight(scene, scene.left(id));
  const right = blackHeight(scene, scene.right(id));
  if (left < 0 || right < 0 || left !== right) return -1;
  return left + (scene.color(id) === 'black' ? 1 : 0);
}

function parse(params: ParamMap): ParseResult<RedBlackInput> {
  const keys = parseTreeKeys(params.input ?? '');
  if (!keys.ok) return keys;
  const ops = parseKeyOps(params.ops ?? '', ['insert']);
  if (!ops.ok) return ops;
  if (keys.value.length === 0 && ops.value.length === 0) {
    return { ok: false, error: 'Give at least one initial key or one insert.' };
  }
  return { ok: true, value: { keys: keys.value, ops: ops.value } };
}

export const redBlack = defineAlgorithm<RedBlackInput>({
  meta: {
    id: 'red-black',
    name: 'Red-black tree',
    category: 'trees',
    structureKind: 'tree',
    blurb: 'Recolour and rotate to keep every root-to-leaf path within 2x.',
    complexity: {
      time: { best: 'O(log n)', average: 'O(log n)', worst: 'O(log n)' },
      space: 'O(n)',
      notes: [
        'Invariants: the root is black, no red node has a red child, and every root-to-null path has the same number of black nodes. Together they bound the height at 2 log2(n+1).',
        'Insert does at most two rotations. Case 1 does none, which is why it can repeat up the tree.',
        'Looser than AVL (taller trees) but cheaper to maintain, which is why std::map and Java TreeMap use it.',
        'Deletion is not implemented here; its six cases deserve their own screen.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'reads', 'writes'],
  },
  fields: [
    { ...keysField, defaultValue: '10, 20, 30, 15, 25, 5, 1' },
    opsField('insert 27; insert 26; insert 28', ['insert']),
    seedField,
  ],
  presets: treePresets(['insert']),
  sizeRange: { min: 1, max: 40, step: 1 },
  parse,
  *run(input) {
    const scene = new TreeScene('binary');

    if (input.keys.length > 0) {
      yield scene.frame({
        codeLine: LINE.insertEnter,
        explanation: `Insert ${input.keys.length} keys in order: ${input.keys.join(', ')}. Watch the black count on every root-to-null path stay equal.`,
        phase: 'build',
      });
      for (const key of input.keys) {
        yield* insert(scene, key, 'build');
        yield beat(scene, key, 'build');
      }
    }

    for (const op of input.ops) {
      yield* insert(scene, op.key, 'insert');
      yield beat(scene, op.key, 'insert');
    }

    const counters = scene.counters();
    yield scene.frame({
      codeLine: 0,
      explanation: `Done: ${scene.size} nodes, height ${scene.height(scene.root) + 1}, black-height ${blackHeight(scene, scene.root)}, ${counters.extra.rotations ?? 0} rotation(s), ${counters.extra.recolours ?? 0} recolour step(s).`,
      phase: 'done',
    });
  },
});
