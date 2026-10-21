import { describe, expect, it } from 'vitest';

import { parseMatrixRef } from '../../core/matrixScene';
import type { Frame } from '../../core/types';
import { expectDeterministic, expectFrameHygiene, expectInputContract, gridOf, lastFrame, runFrames } from '../frameHygiene';
import { MAX_N, MIN_N, nQueens, PRUNED, STEP, TRIES } from './nQueens';

function solve(n: number): readonly Frame[] {
  return runFrames(nQueens, { n: String(n) });
}

/** queens[row] = column, read back off the final board. */
function queensOf(frame: Frame): number[] {
  const board = gridOf(frame);
  return Array.from({ length: board.rows }, (_, row) =>
    Array.from({ length: board.cols }, (_, col) => board.cells[row * board.cols + col]).indexOf('Q'),
  );
}

function attacks(a: { row: number; col: number }, b: { row: number; col: number }): boolean {
  return a.col === b.col || Math.abs(a.col - b.col) === Math.abs(a.row - b.row);
}

/** The same search, without frames: squares tried and queens placed. */
function reference(n: number): { tries: number; placed: number; queens: number[] } {
  let tries = 0;
  let placed = 0;
  const queens: number[] = [];
  const go = (row: number): boolean => {
    if (row === n) return true;
    for (let col = 0; col < n; col++) {
      tries += 1;
      if (queens.some((c, r) => attacks({ row: r, col: c }, { row, col }))) continue;
      placed += 1;
      queens.push(col);
      if (go(row + 1)) return true;
      queens.pop();
    }
    return false;
  };
  go(0);
  return { tries, placed, queens: [...queens] };
}

describe('n-queens: correctness', () => {
  it('finds the first solution in column order, for every n', () => {
    for (let n = MIN_N; n <= MAX_N; n++) {
      const end = lastFrame(solve(n));
      const queens = queensOf(end);
      expect(queens, `n=${n}`).toEqual(reference(n).queens);
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) {
          expect(attacks({ row: a, col: queens[a] ?? -1 }, { row: b, col: queens[b] ?? -1 }), `n=${n}: rows ${a} and ${b}`).toBe(false);
        }
      }
    }
    expect(queensOf(lastFrame(solve(4)))).toEqual([1, 3, 0, 2]);
    expect(queensOf(lastFrame(solve(8)))).toEqual([0, 4, 7, 5, 2, 6, 1, 3]);
  });

  it('tries exactly the squares the plain search tries, and grows one tree node per placed queen', () => {
    for (let n = MIN_N; n <= MAX_N; n++) {
      const { tries, placed } = reference(n);
      const end = lastFrame(solve(n));
      expect(end.counters.extra[TRIES], `n=${n}`).toBe(tries);
      expect(gridOf(end).tree?.nodes.length, `n=${n}`).toBe(placed + 1);
      expect((end.counters.extra[PRUNED] ?? 0) + placed, `n=${n}: every try is pruned or placed`).toBe(tries);
    }
    expect(lastFrame(solve(8)).counters.extra[TRIES]).toBe(876);
  });
});

describe('n-queens: pruning made visible', () => {
  it('draws, on every pruned square, a real attack from a queen on the board', () => {
    for (const frame of solve(6).filter((candidate) => candidate.step === STEP.prune)) {
      const board = gridOf(frame);
      expect(board.lines).toHaveLength(1);
      const [line] = board.lines;
      if (line === undefined) continue;
      expect(board.cells[line.from.row * board.cols + line.from.col]).toBe('Q');
      expect(board.cells[line.to.row * board.cols + line.to.col]).toBeNull();
      expect(attacks(line.from, line.to)).toBe(true);
      const pivot = frame.highlights.pivot?.[0];
      expect(parseMatrixRef(String(pivot))).toEqual({ kind: 'cell', ...line.from });
    }
  });

  it('draws no attack line on any other frame', () => {
    const others = solve(5).filter((frame) => frame.step !== STEP.prune);
    expect(others.every((frame) => gridOf(frame).lines.length === 0)).toBe(true);
  });

  it('counts the pruned squares on the tree node they were pruned under', () => {
    const end = lastFrame(solve(4));
    const badges = gridOf(end).tree?.nodes.map((node) => Number(node.badges?.['×'] ?? 0)) ?? [];
    expect(badges.reduce((sum, count) => sum + count, 0)).toBe(end.counters.extra[PRUNED]);
  });
});

describe('n-queens: frame contract', () => {
  it('keeps the frame contract for every n', () => {
    for (let n = MIN_N; n <= MAX_N; n++) expectFrameHygiene(nQueens, solve(n), { maxStackDepth: MAX_N + 2 });
  });

  it('rejects sizes it does not draw', () => {
    for (const n of ['3', '9', '4.5', '']) expect(nQueens.build({ n }).ok, n).toBe(false);
  });

  it('is deterministic and honours its input contract', () => {
    expectDeterministic(nQueens, {});
    expectInputContract(nQueens);
  });
});
