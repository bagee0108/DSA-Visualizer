import { describe, expect, it } from 'vitest';

import { expectFrameHygiene, gridOf, runFrames } from '../algorithms/frameHygiene';
import { defineAlgorithm, type AlgorithmDefinition } from './define';
import { GridScene } from './gridScene';

const headers = (count: number): string[] => Array.from({ length: count }, (_, at) => String(at));

function board(searchTree = false): GridScene {
  return new GridScene({ rows: 2, cols: 3, rowHeaders: headers(2), colHeaders: headers(3), piece: 'text', searchTree });
}

describe('search tree hygiene', () => {
  const definition: Omit<AlgorithmDefinition<null>, 'run'> = {
    meta: {
      id: 'broken-board',
      name: 'Broken board',
      category: 'backtracking',
      structureKind: 'grid',
      blurb: 'x',
      complexity: { time: { best: '1', average: '1', worst: '1' }, space: '1' },
      code: 'x',
      trackedCounters: [],
    },
    fields: [],
    parse: () => ({ ok: true, value: null }),
  };

  it('catches a child that does not point back at its parent', () => {
    const broken = defineAlgorithm<null>({
      ...definition,
      *run() {
        const scene = board(true);
        const root = scene.tree?.create('·') ?? '';
        scene.tree?.setRoot(root);
        const frame = scene.frame({ explanation: 'x', codeLine: 1 });
        const grid = gridOf(frame);
        const tree = grid.tree;
        if (tree === null) return;
        const orphan = { id: 'ghost', label: 'g', parentId: null, children: [] };
        const nodes = Object.freeze([{ ...tree.nodes[0], id: root, label: '·', parentId: null, children: ['ghost'] }, orphan]);
        yield { ...frame, structure: { ...grid, tree: { ...tree, nodes } } };
      },
    });
    expect(() => expectFrameHygiene(broken, runFrames(broken, {}))).toThrow(/tree shape/);
  });
});

describe('GridScene', () => {
  it('sets and clears squares, counting the writes', () => {
    const scene = board();
    scene.set(1, 2, '7');
    expect(scene.peek(1, 2)).toBe('7');
    scene.set(1, 2, null);
    expect(scene.peek(1, 2)).toBeNull();
    expect(scene.counters().writes).toBe(2);
    expect(scene.counters().reads).toBe(0);
    scene.read(0, 0);
    expect(scene.counters().reads).toBe(1);
  });

  it('shares one frozen cell array between frames that change nothing', () => {
    const scene = board();
    scene.set(0, 0, '1');
    const a = gridOf(scene.frame({ explanation: 'a', codeLine: 1 }));
    const b = gridOf(scene.frame({ explanation: 'b', codeLine: 1 }));
    expect(a.cells).toBe(b.cells);
    expect(Object.isFrozen(a.cells)).toBe(true);
    scene.set(0, 1, '2');
    const c = gridOf(scene.frame({ explanation: 'c', codeLine: 1 }));
    expect(c.cells).not.toBe(a.cells);
    expect(a.cells[1]).toBeNull();
  });

  it('refuses squares off the board and headers that do not fit', () => {
    const scene = board();
    expect(() => scene.set(2, 0, '1')).toThrow(RangeError);
    expect(() => scene.peek(0, -1)).toThrow(RangeError);
    expect(() => new GridScene({ rows: 2, cols: 2, rowHeaders: headers(2), colHeaders: headers(3), piece: 'text' })).toThrow(RangeError);
  });

  it('carries its search tree in every frame, or none at all', () => {
    expect(gridOf(board().frame({ explanation: 'x', codeLine: 1 })).tree).toBeNull();
    const searching = board(true);
    const root = searching.tree?.create('·') ?? '';
    searching.tree?.setRoot(root);
    const tree = gridOf(searching.frame({ explanation: 'x', codeLine: 1 })).tree;
    expect(tree?.rootId).toBe(root);
    expect(tree?.strips).toHaveLength(0);
  });
});
