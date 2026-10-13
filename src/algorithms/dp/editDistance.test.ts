import { describe, expect, it } from 'vitest';

import { makeRng } from '../../core/random';
import { randomString } from '../../core/stringInput';
import type { Frame } from '../../core/types';
import { expectDeterministic, expectFrameHygiene, expectInputContract, lastFrame, matrixOf, runFrames } from '../frameHygiene';
import { editDistance } from './editDistance';

function solve(a: string, b: string): readonly Frame[] {
  return runFrames(editDistance, { a, b });
}

function distanceOf(frames: readonly Frame[]): number | null {
  const table = matrixOf(lastFrame(frames));
  return table.cells[table.cells.length - 1] ?? null;
}

function scriptOf(frames: readonly Frame[]): string[] {
  const strip = matrixOf(lastFrame(frames)).strips.find((candidate) => candidate.label === 'edits');
  return (strip?.items ?? []).map((item) => item.label);
}

/** Replays the script on a; null if a step does not fit. */
function apply(a: string, script: readonly string[]): string | null {
  let at = 0;
  let out = '';
  for (const step of script) {
    if (step.startsWith('+')) {
      out += step.slice(1);
      continue;
    }
    const char = a[at];
    if (char === undefined) return null;
    if (step.startsWith('=')) {
      if (step.slice(1) !== char) return null;
      out += char;
    } else if (step.startsWith('-')) {
      if (step.slice(1) !== char) return null;
    } else {
      const [from, to] = step.split('→');
      if (from !== char || to === undefined) return null;
      out += to;
    }
    at += 1;
  }
  return at === a.length ? out : null;
}

/** Recursion over suffixes, memoised: a different formulation from the table. */
function reference(a: string, b: string): number {
  const memo = new Map<string, number>();
  const go = (i: number, j: number): number => {
    if (i === a.length) return b.length - j;
    if (j === b.length) return a.length - i;
    const key = `${i},${j}`;
    const seen = memo.get(key);
    if (seen !== undefined) return seen;
    const value = a[i] === b[j] ? go(i + 1, j + 1) : 1 + Math.min(go(i + 1, j), go(i, j + 1), go(i + 1, j + 1));
    memo.set(key, value);
    return value;
  };
  return go(0, 0);
}

describe('edit distance: correctness', () => {
  it('solves the textbook pairs', () => {
    expect(distanceOf(solve('kitten', 'sitting'))).toBe(3);
    expect(distanceOf(solve('sunday', 'saturday'))).toBe(3);
    expect(distanceOf(solve('abc', 'abc'))).toBe(0);
  });

  it('agrees with a reference and its script really turns a into b', () => {
    const rng = makeRng(20261013);
    for (let trial = 0; trial < 200; trial++) {
      const a = randomString(rng, 1 + Math.floor(rng() * 10), 'ABCD');
      const b = randomString(rng, 1 + Math.floor(rng() * 10), 'ABCD');
      const frames = solve(a, b);
      const script = scriptOf(frames);
      expect(distanceOf(frames), `${a} -> ${b}`).toBe(reference(a, b));
      expect(apply(a, script), `${a} -> ${b}: ${script.join(' ')}`).toBe(b);
      expect(script.filter((step) => !step.startsWith('=')).length, `${a} -> ${b}`).toBe(reference(a, b));
    }
  });

  it('counts a full rewrite when nothing is shared', () => {
    expect(distanceOf(solve('ABC', 'XYZ'))).toBe(3);
    expect(distanceOf(solve('AB', 'WXYZ'))).toBe(4);
  });

  it('traces a path from the corner all the way to the origin', () => {
    const a = 'kitten';
    const b = 'sitting';
    const { path } = matrixOf(lastFrame(solve(a, b)));
    expect(path[0]).toEqual({ row: a.length, col: b.length });
    expect(path[path.length - 1]).toEqual({ row: 0, col: 0 });
    for (let at = 1; at < path.length; at++) {
      const prev = path[at - 1];
      const step = path[at];
      if (prev === undefined || step === undefined) continue;
      const dr = prev.row - step.row;
      const dc = prev.col - step.col;
      expect(dr >= 0 && dc >= 0 && dr <= 1 && dc <= 1 && dr + dc >= 1).toBe(true);
    }
  });

  it('labels every arrow with the move it stands for', () => {
    for (const frame of solve('kitten', 'sitting')) {
      for (const arrow of matrixOf(frame).arrows) {
        const dr = arrow.to.row - arrow.from.row;
        const dc = arrow.to.col - arrow.from.col;
        const expected = dr === 1 && dc === 1 ? ['keep', 'replace'] : dr === 1 ? ['delete'] : ['insert'];
        expect(expected).toContain(arrow.label);
      }
    }
  });
});

describe('edit distance: operation counts', () => {
  it('writes each cell once, and the shared corner twice', () => {
    for (const [a, b] of [['kitten', 'sitting'], ['AAAA', 'AA'], ['ABCDEFGHIJKL', 'LKJIHGFEDCBA']] as const) {
      const counters = lastFrame(solve(a, b)).counters;
      expect(counters.writes, `${a}/${b}`).toBe(a.length + 1 + b.length + 1 + a.length * b.length);
      expect(counters.extra['cells filled'], `${a}/${b}`).toBe((a.length + 1) * (b.length + 1));
    }
  });

  it('reads one neighbour on a match and three on a mismatch while filling', () => {
    const a = 'kitten';
    const b = 'sitting';
    const filling = solve(a, b).filter((frame) => frame.phase === 'fill');
    const matches = [...a].reduce((sum, ca) => sum + [...b].filter((cb) => cb === ca).length, 0);
    const cells = a.length * b.length;
    expect(filling[filling.length - 1]?.counters.reads).toBe(matches + 3 * (cells - matches));
  });
});

describe('edit distance: frame hygiene', () => {
  it('holds every structural invariant', () => {
    expectFrameHygiene(editDistance, solve('kitten', 'sitting'));
  });

  it('holds them at the size cap and on single characters', () => {
    expectFrameHygiene(editDistance, solve('ABCDEFGHIJKL', 'BDFHJLACEGIK'));
    expectFrameHygiene(editDistance, solve('A', 'B'));
    expectFrameHygiene(editDistance, solve('A', 'A'));
  });

  it('is deterministic', () => {
    expectDeterministic(editDistance, { a: 'kitten', b: 'sitting' });
  });

  it('honours its input contract', () => {
    expectInputContract(editDistance);
  });

  it('rejects bad input', () => {
    expect(editDistance.build({ a: '', b: 'AB' }).ok).toBe(false);
    expect(editDistance.build({ a: 'AB', b: 'a b!' }).ok).toBe(false);
    expect(editDistance.build({ a: 'AB', b: 'ABCDEFGHIJKLM' }).ok).toBe(false);
  });

  it('runs every preset at every size', () => {
    for (const preset of editDistance.presets) {
      for (const size of [editDistance.sizeRange.min, 7, editDistance.sizeRange.max]) {
        const params = preset.build(size, makeRng(size));
        expect(editDistance.build(params).ok, `preset=${preset.id} size=${size}`).toBe(true);
      }
    }
  });
});
