import { describe, expect, it } from 'vitest';

import { parseMatrixRef } from '../../core/matrixScene';
import type { Frame } from '../../core/types';
import { expectDeterministic, expectFrameHygiene, expectInputContract, gridOf, lastFrame, runFrames } from '../frameHygiene';
import { BACKTRACKS, ESCARGOT, EASY, GUESSES, GUESSY, MINI, PLACED, STEP, sudoku } from './sudoku';

const PRESETS = { EASY, GUESSY, ESCARGOT, MINI } as const;

function solve(puzzle: string): readonly Frame[] {
  return runFrames(sudoku, { puzzle });
}

function digits(puzzle: string): number[] {
  return [...puzzle.replace(/[\s|+-]/g, '')].map((char) => (char === '.' || char === '0' ? 0 : Number(char)));
}

function sideOf(cells: readonly unknown[]): { n: number; box: number } {
  const n = Math.sqrt(cells.length);
  return { n, box: Math.sqrt(n) };
}

/** Each unit's squares: rows, then columns, then boxes, as the solver scans them. */
function units(n: number, box: number): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < n; r++) out.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) out.push(Array.from({ length: n }, (_, r) => r * n + c));
  for (let b = 0; b < n; b++) {
    const squares: number[] = [];
    for (let r = 0; r < box; r++) for (let c = 0; c < box; c++) squares.push((Math.floor(b / box) * box + r) * n + (b % box) * box + c);
    out.push(squares);
  }
  return out;
}

function peers(n: number, box: number, at: number): number[] {
  return [...new Set(units(n, box).filter((unit) => unit.includes(at)).flat())].filter((square) => square !== at);
}

/** The same search with no frames: naked singles, then hidden singles, then a guess on the fewest candidates. */
function reference(puzzle: string): { solution: number[] | null; placed: number; guesses: number; backtracks: number } {
  let grid = digits(puzzle);
  const { n, box } = sideOf(grid);
  const unitList = units(n, box);
  const peerList = grid.map((_, at) => peers(n, box, at));
  let cand: (Set<number> | null)[] = grid.map((digit, at) =>
    digit !== 0 ? null : new Set(Array.from({ length: n }, (_, d) => d + 1).filter((d) => !peerList[at]?.some((peer) => grid[peer] === d))),
  );
  let placed = 0;
  let guesses = 0;
  let backtracks = 0;
  const place = (at: number, digit: number): void => {
    grid[at] = digit;
    cand[at] = null;
    placed += 1;
    for (const peer of peerList[at] ?? []) cand[peer]?.delete(digit);
  };
  const propagate = (): boolean => {
    for (;;) {
      if (cand.some((set) => set?.size === 0)) return false;
      const naked = cand.findIndex((set) => set?.size === 1);
      if (naked >= 0) {
        place(naked, [...(cand[naked] ?? [])][0] ?? 0);
        continue;
      }
      let hidden: [number, number] | null = null;
      scan: for (const unit of unitList) {
        for (let d = 1; d <= n; d++) {
          if (unit.some((at) => grid[at] === d)) continue;
          const homes = unit.filter((at) => cand[at]?.has(d) === true);
          if (homes.length === 1) {
            hidden = [homes[0] ?? 0, d];
            break scan;
          }
        }
      }
      if (hidden === null) return true;
      place(...hidden);
    }
  };
  const go = (): boolean => {
    if (!propagate()) return false;
    let best = -1;
    cand.forEach((set, at) => {
      if (set !== null && (best < 0 || set.size < (cand[best]?.size ?? 0))) best = at;
    });
    if (best < 0) return true;
    for (const d of [...(cand[best] ?? [])].sort((a, b) => a - b)) {
      const savedGrid = [...grid];
      const savedCand = cand.map((set) => (set === null ? null : new Set(set)));
      guesses += 1;
      place(best, d);
      if (go()) return true;
      backtracks += 1;
      grid = savedGrid;
      cand = savedCand;
    }
    return false;
  };
  const ok = go();
  return { solution: ok ? grid : null, placed, guesses, backtracks };
}

function boardOf(frame: Frame): number[] {
  return gridOf(frame).cells.map((cell) => (cell === null ? 0 : Number(cell)));
}

describe('sudoku: correctness', () => {
  it('solves every preset to a valid grid that keeps the givens', () => {
    for (const [label, puzzle] of Object.entries(PRESETS)) {
      const board = boardOf(lastFrame(solve(puzzle)));
      const { n, box } = sideOf(board);
      const expected = Array.from({ length: n }, (_, d) => d + 1);
      for (const unit of units(n, box)) expect(unit.map((at) => board[at]).sort((a, b) => (a ?? 0) - (b ?? 0)), label).toEqual(expected);
      digits(puzzle).forEach((given, at) => {
        if (given !== 0) expect(board[at], `${label} given ${at}`).toBe(given);
      });
      expect(board, label).toEqual(reference(puzzle).solution);
    }
  });

  it('places, guesses and backtracks exactly as often as the plain search', () => {
    for (const [label, puzzle] of Object.entries(PRESETS)) {
      const { placed, guesses, backtracks } = reference(puzzle);
      const end = lastFrame(solve(puzzle));
      expect([end.counters.extra[PLACED], end.counters.extra[GUESSES], end.counters.extra[BACKTRACKS]], label).toEqual([placed, guesses, backtracks]);
      expect(gridOf(end).tree?.nodes.length, `${label}: one tree node per guess`).toBe(guesses + 1);
    }
    expect(reference(EASY).guesses, 'singles alone solve the easy preset').toBe(0);
    expect(reference(MINI).guesses).toBe(0);
    expect(reference(GUESSY).guesses).toBeGreaterThan(0);
    expect(reference(ESCARGOT).backtracks).toBeGreaterThan(0);
  });

  it('reports a puzzle with no solution', () => {
    const frames = solve('123....4........');
    expect(frames.some((frame) => frame.step === STEP.dead)).toBe(true);
    expect(lastFrame(frames).explanation).toMatch(/no solution/);
  });
});

describe('sudoku: the board tells the truth', () => {
  it('pencils in, on every frame, exactly the digits no peer holds', () => {
    for (const puzzle of [MINI, GUESSY]) {
      for (const frame of solve(puzzle).slice(1)) {
        const board = gridOf(frame);
        const values = boardOf(frame);
        const { n, box } = sideOf(values);
        values.forEach((digit, at) => {
          const mark = board.marks?.[at] ?? null;
          if (digit !== 0) {
            expect(mark).toBeNull();
            return;
          }
          const open = Array.from({ length: n }, (_, d) => d + 1).filter((d) => !peers(n, box, at).some((peer) => values[peer] === d));
          expect(mark, `frame ${frame.step} square ${at}`).toBe(open.length === 0 ? null : open.join(''));
        });
      }
    }
  });

  it('marks the givens as fixed and nothing else', () => {
    const board = gridOf(lastFrame(solve(GUESSY)));
    expect(board.fixed).toEqual(digits(GUESSY).map((digit) => digit !== 0));
  });

  it('undoes a failed guess completely: the board is back to just before it', () => {
    const frames = solve(ESCARGOT);
    let checked = 0;
    frames.forEach((frame, at) => {
      if (frame.step !== STEP.undo) return;
      const square = parseMatrixRef(String(frame.highlights.pivot?.[0]));
      if (square === null || square.kind !== 'cell') throw new Error('the undone guess is a square');
      // Walk back to the guess this undo answers: the last guess frame on that square.
      let guess = at - 1;
      while (guess >= 0 && !(frames[guess]?.step === STEP.guess && frames[guess]?.highlights.pivot?.[0] === frame.highlights.pivot?.[0])) guess -= 1;
      const before = boardOf(frames[guess] as Frame);
      before[square.row * 9 + square.col] = 0;
      expect(boardOf(frame)).toEqual(before);
      checked += 1;
    });
    expect(checked).toBe(reference(ESCARGOT).backtracks);
  });
});

describe('sudoku: frame contract', () => {
  it('keeps the frame contract for every preset', () => {
    for (const puzzle of Object.values(PRESETS)) expectFrameHygiene(sudoku, solve(puzzle), { maxStackDepth: 82 });
  });

  it('reads a puzzle with separators, and rejects one it cannot', () => {
    expect(sudoku.build({ puzzle: '2... | ..1. | ...4 | .3..' }).ok).toBe(true);
    expect(sudoku.build({ puzzle: '0'.repeat(80) }).ok).toBe(false);
    expect(sudoku.build({ puzzle: '5...............' }).ok, 'a 5 on a 4x4').toBe(false);
    expect(sudoku.build({ puzzle: '11..............' }).ok, 'two 1s in a row').toBe(false);
    expect(sudoku.build({ puzzle: 'x'.repeat(16) }).ok).toBe(false);
  });

  it('is deterministic and honours its input contract', () => {
    expectDeterministic(sudoku, {});
    expectInputContract(sudoku);
  });
});
