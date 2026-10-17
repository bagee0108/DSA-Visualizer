/** N-Queens by backtracking: one queen per row, the search tree beside the board, pruning drawn as the attack that causes it. */

import { defineAlgorithm, type ParamMap, type ParseResult } from '../../core/define';
import { GridScene } from '../../core/gridScene';
import { cellRef, colRef, rowRef } from '../../core/matrixScene';
import type { TreeScene } from '../../core/treeScene';
import type { EntityId, Frame, GridLine } from '../../core/types';

export const MIN_N = 4;
export const MAX_N = 8;

interface QueensInput {
  readonly n: number;
}

const CODE = `function nQueens(n: number): number[] | null {
  const queens: number[] = [];               // queens[row] = its column

  function attacked(row: number, col: number): boolean {
    return queens.some((c, r) => c === col || Math.abs(c - col) === row - r);
  }

  function place(row: number): boolean {
    if (row === n) return true;              // a queen on every row
    for (let col = 0; col < n; col++) {
      if (attacked(row, col)) continue;       // pruned: nothing below is tried
      queens.push(col);                       // safe so far: go a row deeper
      if (place(row + 1)) return true;
      queens.pop();                           // dead end below: take it back
    }
    return false;                             // no column works: backtrack
  }

  return place(0) ? queens : null;
}`;

export const LINE = {
  place: 8,
  done: 9,
  prune: 11,
  push: 12,
  pop: 14,
  fail: 16,
  ret: 19,
} as const;

export const TRIES = 'squares tried';
export const PRUNED = 'pruned';
export const BACKTRACKS = 'backtracks';

function parse(params: ParamMap): ParseResult<QueensInput> {
  const n = Number(params.n ?? '');
  if (!Number.isInteger(n) || n < MIN_N || n > MAX_N) return { ok: false, error: `n must be a whole number from ${MIN_N} to ${MAX_N}.` };
  return { ok: true, value: { n } };
}

/** The queen that attacks (row, col) first, scanning rows top down as attacked() does, and how many queens it looked at. */
function attacker(queens: readonly number[], row: number, col: number): { readonly row: number; readonly checked: number } | null {
  for (let r = 0; r < queens.length; r++) {
    const c = queens[r] ?? -1;
    if (c === col || Math.abs(c - col) === row - r) return { row: r, checked: r + 1 };
  }
  return null;
}

export const nQueens = defineAlgorithm<QueensInput>({
  meta: {
    id: 'n-queens',
    name: 'N-Queens',
    category: 'backtracking',
    structureKind: 'grid',
    blurb: 'The search tree next to the board, with pruning made visible.',
    complexity: {
      time: { best: 'O(n!)', average: 'O(n!)', worst: 'O(n!)' },
      space: 'O(n)',
      notes: [
        'One queen per row is the first pruning: it turns n^2 choose n placements into at most n^n, and the column check cuts that to n!.',
        'The diagonal check prunes far more. 8-Queens tries 876 squares to find its first solution, against 16,777,216 ways to put one queen in each row.',
        'The search tree only ever holds safe partial boards. A pruned square never becomes a node, which is the whole point of checking before going deeper.',
      ],
    },
    code: CODE,
    trackedCounters: ['comparisons', 'recursiveCalls'],
  },
  fields: [
    {
      key: 'n',
      label: 'Board size n',
      kind: 'number',
      defaultValue: '4',
      min: MIN_N,
      max: MAX_N,
      help: `${MIN_N} to ${MAX_N}. The search tree grows fast: 8 places 113 queens before it finds a solution.`,
    },
  ],
  presets: [
    { id: 'four', label: '4 queens', build: () => ({ n: '4' }) },
    { id: 'six', label: '6 queens', build: () => ({ n: '6' }) },
    { id: 'eight', label: '8 queens', build: () => ({ n: '8' }) },
  ],
  sizeRange: { min: MIN_N, max: MAX_N, step: 1 },
  sizeOf: (params) => Number(params.n ?? MIN_N),
  parse,
  *run({ n }) {
    const labels = Array.from({ length: n }, (_, at) => String(at));
    const scene = new GridScene({ rows: n, cols: n, rowHeaders: labels, colHeaders: labels, piece: 'queen', checkered: true, searchTree: true });
    if (scene.tree === null) throw new Error('N-Queens draws its search tree');
    const tree: TreeScene = scene.tree;
    const root = tree.create('·');
    tree.setRoot(root);
    scene.bump(TRIES, 0);
    scene.bump(PRUNED, 0);
    scene.bump(BACKTRACKS, 0);

    const queens: number[] = [];
    const path: string[] = [root];
    const dead = new Set<string>();
    const prunedAt = new Map<string, number>();
    const queenSquares = (): EntityId[] => queens.map((col, row) => cellRef(row, col));
    /** Squares of `row` that some queen already attacks: what the check is about to rule out. */
    const attackedIn = (row: number): EntityId[] => {
      const out: EntityId[] = [];
      for (let col = 0; col < n; col++) if (attacker(queens, row, col) !== null) out.push(cellRef(row, col));
      return out;
    };
    const treeLook = (): { excluded: EntityId[]; visited: EntityId[]; active: EntityId[] } => ({
      excluded: [...dead],
      visited: path.slice(0, -1),
      active: [path[path.length - 1] ?? root],
    });

    yield scene.frame({
      codeLine: LINE.place,
      phase: 'search',
      explanation: `Place ${n} queens so that none attacks another. Two queens on one row always attack, so the search gives each row one queen and only chooses its column. The tree on the right grows a node per safe queen.`,
      highlights: { active: [root] },
    });

    function* place(row: number): Generator<Frame, boolean, undefined> {
      scene.countCall();
      scene.pushCall({ label: `place(${row})`, detail: queens.length === 0 ? 'empty board' : `queens [${queens.join(', ')}]`, codeLine: LINE.place });
      const here = path[path.length - 1] ?? root;

      if (row === n) {
        yield scene.frame({
          codeLine: LINE.done,
          phase: 'solved',
          explanation: `Row ${n} does not exist: every row has a queen and none attacks another. Solved.`,
          highlights: { sorted: [...queenSquares(), ...path], excluded: [...dead] },
        });
        scene.popCall();
        return true;
      }

      for (let col = 0; col < n; col++) {
        scene.bump(TRIES);
        const hit = attacker(queens, row, col);
        scene.countComparison(hit === null ? queens.length : hit.checked);
        const pointers = { row: rowRef(row), col: colRef(col) };

        if (hit !== null) {
          scene.bump(PRUNED);
          const count = (prunedAt.get(here) ?? 0) + 1;
          prunedAt.set(here, count);
          tree.setBadges(here, { '×': count });
          const by = queens[hit.row] ?? 0;
          const how = by === col ? 'column' : 'diagonal';
          const line: GridLine = { from: { row: hit.row, col: by }, to: { row, col } };
          yield scene.frame({
            codeLine: LINE.prune,
            phase: 'search',
            explanation: `(${row}, ${col}) is attacked along the ${how} by the queen at (${hit.row}, ${by}). Pruned: no queen goes here, so nothing below it is ever tried.`,
            highlights: {
              ...treeLook(),
              excluded: [...dead, ...attackedIn(row)],
              comparing: [cellRef(row, col)],
              pivot: [cellRef(hit.row, by)],
              active: [here],
            },
            pointers,
            lines: [line],
          });
          continue;
        }

        queens.push(col);
        scene.set(row, col, 'Q');
        const node = tree.create(String(col));
        tree.attach(here, node);
        path.push(node);
        yield scene.frame({
          codeLine: LINE.push,
          phase: 'search',
          explanation: `(${row}, ${col}) is safe: no queen shares its column or a diagonal. Place it and go a row deeper.`,
          highlights: { ...treeLook(), active: [cellRef(row, col), node] },
          pointers,
        });

        if (yield* place(row + 1)) {
          scene.popCall();
          return true;
        }

        queens.pop();
        scene.set(row, col, null);
        path.pop();
        dead.add(node);
        scene.bump(BACKTRACKS);
        yield scene.frame({
          codeLine: LINE.pop,
          phase: 'backtrack',
          explanation: `No column of row ${row + 1} works with a queen at (${row}, ${col}). Take it back and try the next column of row ${row}.`,
          highlights: { ...treeLook(), excluded: [...dead], comparing: [cellRef(row, col)] },
          pointers,
        });
      }

      yield scene.frame({
        codeLine: LINE.fail,
        phase: 'backtrack',
        explanation:
          row === 0
            ? `Every column of row 0 has been tried: ${n} queens cannot be placed.`
            : `Every column of row ${row} is attacked or leads nowhere, so the queen in row ${row - 1} was a mistake. Return false and let row ${row - 1} move on.`,
        highlights: { ...treeLook(), excluded: [...dead, ...attackedIn(row)] },
        pointers: { row: rowRef(row) },
      });
      scene.popCall();
      return false;
    }

    const solved = yield* place(0);
    const counters = scene.counters();
    yield scene.frame({
      codeLine: LINE.ret,
      phase: 'done',
      explanation: solved
        ? `Queens in columns [${queens.join(', ')}], row by row. The search tried ${counters.extra[TRIES] ?? 0} squares, pruned ${counters.extra[PRUNED] ?? 0} of them before going deeper, and backtracked ${counters.extra[BACKTRACKS] ?? 0} times.`
        : `No placement of ${n} queens works.`,
      highlights: solved ? { sorted: [...queenSquares(), ...path], excluded: [...dead] } : {},
    });
  },
});
