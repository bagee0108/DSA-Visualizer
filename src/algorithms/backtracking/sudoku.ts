/**
 * Sudoku by constraint propagation, guessing only when propagation stalls.
 * Pencil marks are the candidates; singles are placed until none is left;
 * then the square with the fewest candidates is guessed, with the search tree
 * beside the board and every failed guess undone in one step.
 */

import { defineAlgorithm, type ParamMap, type ParseResult } from '../../core/define';
import { GridScene } from '../../core/gridScene';
import { cellRef, colRef, rowRef } from '../../core/matrixScene';
import type { TreeScene } from '../../core/treeScene';
import type { EntityId, Frame, Highlights } from '../../core/types';
import { stepIds } from '../../core/steps';

interface SudokuInput {
  /** Side of the board: 4 or 9. */
  readonly n: number;
  /** Side of a box: 2 or 3. */
  readonly box: number;
  /** Row by row; 0 is an empty square. */
  readonly givens: readonly number[];
}

const CODE = `function sudoku(grid: Grid): Grid | null {
  grid.pencilIn();                               // each empty square: the digits no peer holds
  return solve(grid) ? grid : null;
}

function solve(grid: Grid): boolean {
  if (!propagate(grid)) return false;            // a square ran out of candidates
  const square = grid.fewestCandidates();        // the most constrained empty square
  if (square === null) return true;              // nothing left empty: solved
  for (const digit of grid.candidates(square)) {
    const saved = grid.save();
    grid.place(square, digit);                   // guess, then go deeper
    if (solve(grid)) return true;
    grid.restore(saved);                         // the guess failed: undo everything since
  }
  return false;                                  // no digit works here: backtrack
}

function propagate(grid: Grid): boolean {
  for (;;) {
    if (grid.deadEnd()) return false;            // an empty square with no candidate
    const naked = grid.nakedSingle();            // a square with one candidate left
    if (naked !== null) {
      grid.place(naked.square, naked.digit);     // and strike it from every peer
      continue;
    }
    const hidden = grid.hiddenSingle();          // a digit with one square left in a unit
    if (hidden === null) return true;            // no single left: the search must guess
    grid.place(hidden.square, hidden.digit);
  }
}`;

export const LINE = {
  start: 1,
  pencil: 2,
  ret: 3,
  solve: 6,
  pick: 8,
  solved: 9,
  guess: 12,
  undo: 14,
  fail: 16,
  dead: 21,
  naked: 24,
  stuck: 28,
  hidden: 29,
} as const;
export const STEP = stepIds(LINE);

export const PLACED = 'placed';
export const GUESSES = 'guesses';
export const BACKTRACKS = 'backtracks';

/** Wikipedia's example puzzle: singles alone solve it. */
export const EASY = '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
/** Propagation stalls here, and the search guesses 8 times before it is through. */
export const GUESSY = '85...24..72......9..4.........1.7..23.5...9...4...........8..7..17..........36.4.';
/** Arto Inkala's AI Escargot (2006), billed as the hardest Sudoku. */
export const ESCARGOT = '1....7.9..3..2...8..96..5....53..9...1..8...26....4...3......1..4......7..7...3..';
/** Four givens on a 4x4: small enough to follow every mark. */
export const MINI = '2.....1....4.3..';

/** r1c1 is the top-left square: the usual Sudoku name. */
export function squareName(n: number, at: number): string {
  return `r${Math.floor(at / n) + 1}c${(at % n) + 1}`;
}

function ref(n: number, at: number): EntityId {
  return cellRef(Math.floor(at / n), at % n);
}

interface Unit {
  readonly name: string;
  readonly squares: readonly number[];
}

/** Rows, then columns, then boxes, in reading order: the order the hidden-single scan uses. */
function unitsOf(n: number, box: number): readonly Unit[] {
  const units: Unit[] = [];
  for (let r = 0; r < n; r++) units.push({ name: `row ${r + 1}`, squares: Array.from({ length: n }, (_, c) => r * n + c) });
  for (let c = 0; c < n; c++) units.push({ name: `column ${c + 1}`, squares: Array.from({ length: n }, (_, r) => r * n + c) });
  for (let b = 0; b < n; b++) {
    const top = Math.floor(b / box) * box;
    const left = (b % box) * box;
    const squares: number[] = [];
    for (let r = 0; r < box; r++) for (let c = 0; c < box; c++) squares.push((top + r) * n + left + c);
    units.push({ name: `box ${b + 1}`, squares });
  }
  return units;
}

/** Every square sharing a row, column or box with `at`. */
function peersOf(units: readonly Unit[], at: number): readonly number[] {
  const out = new Set<number>();
  for (const unit of units) if (unit.squares.includes(at)) for (const square of unit.squares) if (square !== at) out.add(square);
  return [...out].sort((a, b) => a - b);
}

function parse(params: ParamMap): ParseResult<SudokuInput> {
  const text = (params.puzzle ?? '').replace(/[\s|+-]/g, '');
  const n = text.length === 81 ? 9 : text.length === 16 ? 4 : 0;
  if (n === 0) return { ok: false, error: `A puzzle is 81 squares (9x9) or 16 (4x4), row by row, with . or 0 for an empty square. This one has ${text.length}.` };
  const box = Math.sqrt(n);
  const givens: number[] = [];
  for (const char of text) {
    if (char === '.' || char === '0' || char === '_') givens.push(0);
    else if (/^[1-9]$/.test(char) && Number(char) <= n) givens.push(Number(char));
    else return { ok: false, error: `"${char}" is not a square of a ${n}x${n} puzzle: use 1 to ${n}, and . or 0 for an empty square.` };
  }
  for (const unit of unitsOf(n, box)) {
    const seen = new Set<number>();
    for (const square of unit.squares) {
      const digit = givens[square] ?? 0;
      if (digit === 0) continue;
      if (seen.has(digit)) return { ok: false, error: `${unit.name[0]?.toUpperCase()}${unit.name.slice(1)} is given two ${digit}s.` };
      seen.add(digit);
    }
  }
  return { ok: true, value: { n, box, givens } };
}

const digitsOf = (set: ReadonlySet<number>): number[] => [...set].sort((a, b) => a - b);

export const sudoku = defineAlgorithm<SudokuInput>({
  meta: {
    id: 'sudoku',
    name: 'Sudoku solver',
    category: 'backtracking',
    structureKind: 'grid',
    blurb: 'Constraint propagation and backtracking on a 9x9 grid.',
    complexity: {
      time: { best: 'O(n^5)', average: 'varies', worst: 'O(n^(n^2))' },
      space: 'O(n^5)',
      notes: [
        'Best case is a puzzle that singles alone solve: n^2 placements, each striking a digit from O(n) peers, with a hidden-single scan of O(n^3) between them.',
        'Sudoku in general is NP-complete, so no method avoids exponential search on every puzzle. Propagation is what keeps the search small in practice: AI Escargot needs only 15 guesses.',
        'Guessing the square with the fewest candidates keeps the tree narrow. A wrong guess there is caught after a few placements, not dozens.',
        'Space is one saved board per open guess: O(n^3) candidates each, at most n^2 deep.',
      ],
    },
    code: CODE,
    stepLines: LINE,
    trackedCounters: ['comparisons', 'recursiveCalls'],
  },
  fields: [
    {
      key: 'puzzle',
      label: 'Puzzle',
      kind: 'text',
      defaultValue: EASY,
      placeholder: '53..7....6..195... (81 squares, row by row)',
      help: '81 squares for a 9x9 or 16 for a 4x4, row by row; . or 0 is empty. Spaces and | are ignored.',
    },
  ],
  presets: [
    { id: 'easy', label: 'Singles only', build: () => ({ puzzle: EASY }) },
    { id: 'guessy', label: 'Needs guesses', build: () => ({ puzzle: GUESSY }) },
    { id: 'escargot', label: 'AI Escargot', build: () => ({ puzzle: ESCARGOT }) },
    { id: 'mini', label: '4x4', build: () => ({ puzzle: MINI }) },
  ],
  sizeRange: { min: 4, max: 9, step: 5 },
  sizeOf: (params) => (parse(params).ok ? Math.sqrt((params.puzzle ?? '').replace(/[\s|+-]/g, '').length) : 9),
  parse,
  *run({ n, box, givens }) {
    const labels = Array.from({ length: n }, (_, at) => String(at + 1));
    const scene = new GridScene({
      rows: n,
      cols: n,
      rowHeaders: labels,
      colHeaders: labels,
      piece: 'text',
      boxes: { rows: box, cols: box },
      marks: true,
      searchTree: true,
    });
    if (scene.tree === null) throw new Error('Sudoku draws its search tree');
    const tree: TreeScene = scene.tree;
    const root = tree.create('·');
    tree.setRoot(root);
    scene.bump(PLACED, 0);
    scene.bump(GUESSES, 0);
    scene.bump(BACKTRACKS, 0);

    const units = unitsOf(n, box);
    const peers = Array.from({ length: n * n }, (_, at) => peersOf(units, at));
    const name = (at: number): string => squareName(n, at);
    const at = (square: number): { row: number; col: number } => ({ row: Math.floor(square / n), col: square % n });
    const pointersFor = (square: number) => ({ row: rowRef(at(square).row), col: colRef(at(square).col) });

    let value = [...givens];
    let candidates: (Set<number> | null)[] = value.map(() => null);
    const mark = (square: number): void => {
      const set = candidates[square];
      scene.mark(at(square).row, at(square).col, set === null || set === undefined || set.size === 0 ? null : digitsOf(set).join(''));
    };
    const empties = (): number[] => value.flatMap((digit, square) => (digit === 0 ? [square] : []));

    const path: string[] = [root];
    const dead = new Set<string>();
    const guesses: string[] = [];
    const treeLook = (): Highlights => ({ excluded: [...dead], visited: path.slice(0, -1), active: [path[path.length - 1] ?? root] });
    const filledByRun = (): EntityId[] => value.flatMap((digit, square) => (digit !== 0 && givens[square] === 0 ? [ref(n, square)] : []));

    /** Writes `digit` into `square` and strikes it from every peer; returns the peers that lost it. */
    const place = (square: number, digit: number): number[] => {
      value[square] = digit;
      candidates[square] = null;
      scene.set(at(square).row, at(square).col, String(digit));
      mark(square);
      scene.bump(PLACED);
      const struck: number[] = [];
      for (const peer of peers[square] ?? []) {
        scene.countComparison();
        const set = candidates[peer];
        if (set?.delete(digit) === true) {
          struck.push(peer);
          mark(peer);
        }
      }
      return struck;
    };
    const struckText = (digit: number, struck: readonly number[]): string =>
      struck.length === 0 ? `No peer still had ${digit} pencilled in.` : `Strike ${digit} from the ${struck.length === 1 ? 'one peer' : `${struck.length} peers`} that still had it.`;

    for (let square = 0; square < n * n; square++) {
      const digit = givens[square] ?? 0;
      if (digit !== 0) scene.give(at(square).row, at(square).col, String(digit));
    }
    const givenCount = givens.filter((digit) => digit !== 0).length;
    yield scene.frame({
      step: STEP.start,
      phase: 'setup',
      explanation: `A ${n}x${n} Sudoku with ${givenCount} givens. Every row, column and ${box}x${box} box must hold 1 to ${n} exactly once. The solver deduces what it can first, and guesses only when deduction stalls.`,
      highlights: { active: [root] },
    });

    for (const square of empties()) {
      const set = new Set<number>();
      for (let digit = 1; digit <= n; digit++) {
        scene.countComparison();
        if (!(peers[square] ?? []).some((peer) => value[peer] === digit)) set.add(digit);
      }
      candidates[square] = set;
      mark(square);
    }
    yield scene.frame({
      step: STEP.pencil,
      phase: 'setup',
      explanation: `Pencil in the candidates: each of the ${empties().length} empty squares gets every digit that none of its ${peers[0]?.length ?? 0} peers (its row, column and box) already holds.`,
      highlights: treeLook(),
    });

    /** Places singles until none is left. False when some square runs out of candidates. */
    function* propagate(): Generator<Frame, boolean, undefined> {
      for (;;) {
        const open = empties();
        scene.countComparison(open.length);
        const stuck = open.find((square) => candidates[square]?.size === 0);
        if (stuck !== undefined) {
          const wrong = guesses[guesses.length - 1];
          yield scene.frame({
            step: STEP.dead,
            phase: 'backtrack',
            explanation: `${name(stuck)} has no candidate left: every digit from 1 to ${n} already sits in its row, column or box. ${
              wrong === undefined ? 'Nothing was guessed, so the puzzle has no solution.' : `The guess ${wrong} cannot be right.`
            }`,
            highlights: { ...treeLook(), swapped: [ref(n, stuck)] },
            pointers: pointersFor(stuck),
          });
          return false;
        }

        const naked = open.find((square) => candidates[square]?.size === 1);
        if (naked !== undefined) {
          const digit = digitsOf(candidates[naked] ?? new Set())[0] ?? 0;
          const struck = place(naked, digit);
          yield scene.frame({
            step: STEP.naked,
            phase: 'propagate',
            explanation: `${name(naked)} has one candidate left, ${digit}, so it must be ${digit}. ${struckText(digit, struck)}`,
            highlights: { ...treeLook(), active: [ref(n, naked), ...(treeLook().active ?? [])], comparing: struck.map((peer) => ref(n, peer)) },
            pointers: pointersFor(naked),
          });
          continue;
        }

        let hidden: { readonly unit: Unit; readonly square: number; readonly digit: number } | null = null;
        scan: for (const unit of units) {
          for (let digit = 1; digit <= n; digit++) {
            if (unit.squares.some((square) => value[square] === digit)) continue;
            scene.countComparison(unit.squares.length);
            const homes = unit.squares.filter((square) => candidates[square]?.has(digit) === true);
            if (homes.length === 1 && homes[0] !== undefined) {
              hidden = { unit, square: homes[0], digit };
              break scan;
            }
          }
        }
        if (hidden === null) return true;

        const others = (candidates[hidden.square]?.size ?? 1) - 1;
        const struck = place(hidden.square, hidden.digit);
        yield scene.frame({
          step: STEP.hidden,
          phase: 'propagate',
          explanation: `In ${hidden.unit.name}, ${hidden.digit} fits only ${name(hidden.square)}, so it goes there even though the square had ${others} other candidate${
            others === 1 ? '' : 's'
          }. ${struckText(hidden.digit, struck)}`,
          highlights: {
            ...treeLook(),
            visited: [...hidden.unit.squares.map((square) => ref(n, square)), ...(treeLook().visited ?? [])],
            active: [ref(n, hidden.square), ...(treeLook().active ?? [])],
            comparing: struck.map((peer) => ref(n, peer)),
          },
          pointers: pointersFor(hidden.square),
        });
      }
    }

    function* solve(): Generator<Frame, boolean, undefined> {
      scene.countCall();
      const after = guesses[guesses.length - 1];
      scene.pushCall({ label: 'solve()', detail: after === undefined ? 'no guesses' : `after ${after}`, step: STEP.solve });
      const here = path[path.length - 1] ?? root;

      if (!(yield* propagate())) {
        scene.popCall();
        return false;
      }

      const open = empties();
      scene.countComparison(open.length);
      if (open.length === 0) {
        yield scene.frame({
          step: STEP.solved,
          phase: 'solved',
          explanation: `No empty square is left, and every placement kept its row, column and box free of repeats. Solved.`,
          highlights: { sorted: [...filledByRun(), ...path], excluded: [...dead] },
        });
        scene.popCall();
        return true;
      }

      let square = open[0] ?? 0;
      for (const candidate of open) if ((candidates[candidate]?.size ?? n) < (candidates[square]?.size ?? n)) square = candidate;
      const options = digitsOf(candidates[square] ?? new Set());
      yield scene.frame({
        step: STEP.pick,
        phase: 'search',
        explanation: `No single is left, so deduction has stalled and the search must guess. ${name(square)} has the fewest candidates, ${options.length}: ${options.join(
          ', ',
        )}. Try them in order.`,
        highlights: { ...treeLook(), pivot: [ref(n, square)] },
        pointers: pointersFor(square),
      });

      for (const digit of options) {
        const saved = { value: [...value], candidates: candidates.map((set) => (set === null ? null : new Set(set))), board: scene.save() };
        const label = `${name(square)}=${digit}`;
        scene.bump(GUESSES);
        guesses.push(label);
        const node = tree.create(String(digit));
        tree.attach(here, node);
        path.push(node);
        const struck = place(square, digit);
        yield scene.frame({
          step: STEP.guess,
          phase: 'search',
          explanation: `Guess ${name(square)} = ${digit}, then propagate from there. ${struckText(digit, struck)} If this leads to a square with no candidates, everything from here on is undone.`,
          highlights: { ...treeLook(), pivot: [ref(n, square)], comparing: struck.map((peer) => ref(n, peer)) },
          pointers: pointersFor(square),
        });

        if (yield* solve()) {
          scene.popCall();
          return true;
        }

        const followed = value.filter((digitNow, at) => digitNow !== 0 && saved.value[at] === 0).length - 1;
        value = saved.value;
        candidates = saved.candidates;
        scene.restore(saved.board);
        guesses.pop();
        path.pop();
        dead.add(node);
        scene.bump(BACKTRACKS);
        yield scene.frame({
          step: STEP.undo,
          phase: 'backtrack',
          explanation: `${label} led to a contradiction. Undo it${
            followed === 0 ? '' : ` and the ${followed === 1 ? 'one placement' : `${followed} placements`} that followed from it`
          }, and put the pencil marks back as they were.`,
          highlights: { ...treeLook(), excluded: [...dead], pivot: [ref(n, square)] },
          pointers: pointersFor(square),
        });
      }

      const above = guesses[guesses.length - 1];
      yield scene.frame({
        step: STEP.fail,
        phase: 'backtrack',
        explanation:
          above === undefined
            ? `Every candidate of ${name(square)} fails with nothing guessed before it: the puzzle has no solution.`
            : `Every candidate of ${name(square)} fails, so the earlier guess ${above} was wrong. Return false and let it move on.`,
        highlights: { ...treeLook(), swapped: [ref(n, square)] },
        pointers: pointersFor(square),
      });
      scene.popCall();
      return false;
    }

    const solved = yield* solve();
    const counters = scene.counters();
    yield scene.frame({
      step: STEP.ret,
      phase: 'done',
      explanation: solved
        ? `Solved. ${counters.extra[PLACED] ?? 0} placements, ${counters.extra[GUESSES] ?? 0} of them guesses, and ${counters.extra[BACKTRACKS] ?? 0} backtracks. The highlighted squares are the ones the solver filled in.`
        : 'This puzzle has no solution.',
      highlights: solved ? { sorted: [...filledByRun(), ...path], excluded: [...dead] } : { excluded: [...dead] },
    });
  },
});
