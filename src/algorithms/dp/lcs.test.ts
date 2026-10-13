import { describe, expect, it } from 'vitest';

import { makeRng } from '../../core/random';
import { randomString } from '../../core/stringInput';
import type { Frame } from '../../core/types';
import { expectDeterministic, expectFrameHygiene, expectInputContract, lastFrame, matrixOf, runFrames } from '../frameHygiene';
import { lcs } from './lcs';

function solve(a: string, b: string): readonly Frame[] {
  return runFrames(lcs, { a, b });
}

function answerOf(frames: readonly Frame[]): string {
  const strip = matrixOf(lastFrame(frames)).strips.find((candidate) => candidate.label === 'lcs');
  return (strip?.items ?? []).map((item) => item.label).join('');
}

function isSubsequence(small: string, big: string): boolean {
  let at = 0;
  for (const char of big) if (at < small.length && small[at] === char) at += 1;
  return at === small.length;
}

/** Every subsequence of a, longest first: independent of the table. */
function bruteForce(a: string, b: string): number {
  let best = 0;
  for (let mask = 0; mask < 1 << a.length; mask++) {
    let pick = '';
    for (let at = 0; at < a.length; at++) if (mask & (1 << at)) pick += a[at];
    if (pick.length > best && isSubsequence(pick, b)) best = pick.length;
  }
  return best;
}

describe('lcs: correctness', () => {
  it('solves the textbook pair', () => {
    const frames = solve('ABCBDAB', 'BDCABA');
    const table = matrixOf(lastFrame(frames));
    expect(table.cells[table.cells.length - 1]).toBe(4);
    const answer = answerOf(frames);
    expect(answer).toHaveLength(4);
    expect(isSubsequence(answer, 'ABCBDAB')).toBe(true);
    expect(isSubsequence(answer, 'BDCABA')).toBe(true);
  });

  it('agrees with brute force and returns a real common subsequence', () => {
    const rng = makeRng(20261013);
    for (let trial = 0; trial < 150; trial++) {
      const a = randomString(rng, 1 + Math.floor(rng() * 9), 'ABCD');
      const b = randomString(rng, 1 + Math.floor(rng() * 9), 'ABCD');
      const frames = solve(a, b);
      const answer = answerOf(frames);
      const table = matrixOf(lastFrame(frames));
      expect(table.cells[table.cells.length - 1], `${a} / ${b}`).toBe(bruteForce(a, b));
      expect(answer.length, `${a} / ${b}`).toBe(bruteForce(a, b));
      expect(isSubsequence(answer, a) && isSubsequence(answer, b), `${answer} in ${a} / ${b}`).toBe(true);
    }
  });

  it('returns an empty answer when nothing is shared', () => {
    const frames = solve('ABC', 'XYZ');
    expect(answerOf(frames)).toBe('');
    expect(matrixOf(lastFrame(frames)).cells.every((value) => value === 0)).toBe(true);
  });

  it('returns the whole string for identical inputs', () => {
    expect(answerOf(solve('BANANA', 'BANANA'))).toBe('BANANA');
  });

  it('fills every cell, row by row', () => {
    const frames = solve('ACGT', 'GATTACA');
    const table = matrixOf(lastFrame(frames));
    expect(table.cells.every((value) => value !== null)).toBe(true);
    let filled = 0;
    for (const frame of frames) {
      const count = matrixOf(frame).cells.filter((value) => value !== null).length;
      expect(count).toBeGreaterThanOrEqual(filled);
      filled = count;
    }
  });

  it('traces a monotone path from the corner to an edge', () => {
    const a = 'ABCBDAB';
    const b = 'BDCABA';
    const { path } = matrixOf(lastFrame(solve(a, b)));
    expect(path[0]).toEqual({ row: a.length, col: b.length });
    const end = path[path.length - 1];
    expect(end === undefined || end.row === 0 || end.col === 0).toBe(true);
    for (let at = 1; at < path.length; at++) {
      const prev = path[at - 1];
      const step = path[at];
      if (prev === undefined || step === undefined) continue;
      const dr = prev.row - step.row;
      const dc = prev.col - step.col;
      expect(dr >= 0 && dc >= 0 && dr + dc >= 1 && dr <= 1 && dc <= 1).toBe(true);
    }
  });

  it('draws arrows only into the cell being filled, from its neighbours', () => {
    for (const frame of solve('ABCBDAB', 'BDCABA')) {
      for (const arrow of matrixOf(frame).arrows) {
        const dr = arrow.to.row - arrow.from.row;
        const dc = arrow.to.col - arrow.from.col;
        expect(dr >= 0 && dc >= 0 && dr <= 1 && dc <= 1 && dr + dc >= 1).toBe(true);
      }
    }
  });
});

describe('lcs: operation counts', () => {
  it('writes each cell once, and the shared corner twice', () => {
    for (const [a, b] of [['ABCBDAB', 'BDCABA'], ['AAAA', 'AA'], ['ABCDEFGHIJKL', 'LKJIHGFEDCBA']] as const) {
      const counters = lastFrame(solve(a, b)).counters;
      expect(counters.writes, `${a}/${b}`).toBe(a.length + 1 + b.length + 1 + a.length * b.length);
      expect(counters.extra['cells filled'], `${a}/${b}`).toBe((a.length + 1) * (b.length + 1));
    }
  });

  it('compares each pair of characters once while filling', () => {
    const a = 'ABCBDAB';
    const b = 'BDCABA';
    const frames = solve(a, b);
    const filling = frames.filter((frame) => frame.phase === 'fill');
    const last = filling[filling.length - 1];
    const mismatches = [...a].reduce((sum, ca) => sum + [...b].filter((cb) => cb !== ca).length, 0);
    expect(last?.counters.comparisons).toBe(a.length * b.length + mismatches);
  });
});

describe('lcs: frame hygiene', () => {
  it('holds every structural invariant', () => {
    expectFrameHygiene(lcs, solve('ABCBDAB', 'BDCABA'));
  });

  it('holds them at the size cap and on single characters', () => {
    expectFrameHygiene(lcs, solve('ABCDEFGHIJKL', 'BDFHJLACEGIK'));
    expectFrameHygiene(lcs, solve('A', 'B'));
  });

  it('is deterministic', () => {
    expectDeterministic(lcs, { a: 'ABCBDAB', b: 'BDCABA' });
  });

  it('honours its input contract', () => {
    expectInputContract(lcs);
  });

  it('rejects bad input', () => {
    expect(lcs.build({ a: '', b: 'AB' }).ok).toBe(false);
    expect(lcs.build({ a: 'A-B', b: 'AB' }).ok).toBe(false);
    expect(lcs.build({ a: 'ABCDEFGHIJKLM', b: 'AB' }).ok).toBe(false);
  });

  it('runs every preset at every size', () => {
    for (const preset of lcs.presets) {
      for (const size of [lcs.sizeRange.min, 7, lcs.sizeRange.max]) {
        const params = preset.build(size, makeRng(size));
        expect(lcs.build(params).ok, `preset=${preset.id} size=${size}`).toBe(true);
      }
    }
  });
});
