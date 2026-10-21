import { describe, expect, it } from 'vitest';

import { makeRng, randomInt } from '../../core/random';
import { randomString } from '../../core/stringInput';
import type { Frame } from '../../core/types';
import {
  arrayOf,
  expectDeterministic,
  expectFrameHygiene,
  expectInputContract,
  indexPointer,
  lastFrame,
  lettersOf,
  runFrames,
} from '../frameHygiene';
import { kmp, MAX_PATTERN, MAX_TEXT, STEP } from './kmp';

const HYGIENE = { allowSizeChange: true } as const;

function solve(text: string, pattern: string): readonly Frame[] {
  return runFrames(kmp, { text, pattern });
}

/** Match starts, read back from the frames that announce a whole match. */
function matchesOf(frames: readonly Frame[], m: number): number[] {
  return frames
    .filter((frame) => frame.step === STEP.whole)
    .map((frame) => (indexPointer(frame, 'i') ?? NaN) - m + 1);
}

/** pi, read back from the corner notes on the pattern after the first phase. */
function piOf(frames: readonly Frame[], m: number): number[] {
  const last = frames.filter((frame) => frame.phase === 'failure function').at(-1);
  const elements = arrayOf(last).elements;
  expect(elements).toHaveLength(m);
  return elements.map((element) => Number(element.note));
}

/** Every start, overlapping ones included, by checking each shift. */
function naive(text: string, pattern: string): number[] {
  const out: number[] = [];
  for (let at = 0; at + pattern.length <= text.length; at++) if (text.startsWith(pattern, at)) out.push(at);
  return out;
}

/** pi by definition: the longest proper prefix that is also a suffix. */
function naivePi(pattern: string): number[] {
  return [...pattern].map((_, i) => {
    const head = pattern.slice(0, i + 1);
    for (let length = i; length > 0; length--) if (head.endsWith(head.slice(0, length))) return length;
    return 0;
  });
}

describe('kmp: correctness', () => {
  it('finds the textbook match and its failure function', () => {
    const frames = solve('ABABDABACDABABCABAB', 'ABABCABAB');
    expect(matchesOf(frames, 9)).toEqual([10]);
    expect(piOf(frames, 9)).toEqual([0, 0, 1, 2, 0, 1, 2, 3, 4]);
  });

  it('finds overlapping matches', () => {
    expect(matchesOf(solve('AAAAAA', 'AAA'), 3)).toEqual([0, 1, 2, 3]);
    expect(matchesOf(solve('ABABABA', 'ABA'), 3)).toEqual([0, 2, 4]);
  });

  it('agrees with checking every shift, on random inputs', () => {
    const rng = makeRng(424242);
    for (let trial = 0; trial < 200; trial++) {
      const n = randomInt(rng, 1, MAX_TEXT);
      const m = randomInt(rng, 1, Math.min(n, MAX_PATTERN));
      const alphabet = trial % 2 === 0 ? 'AB' : 'ABC';
      const text = randomString(rng, n, alphabet);
      const pattern = randomString(rng, m, alphabet);
      const frames = solve(text, pattern);
      expect(matchesOf(frames, m), `${pattern} in ${text}`).toEqual(naive(text, pattern));
      expect(piOf(frames, m), `pi of ${pattern}`).toEqual(naivePi(pattern));
    }
  });

  it('says where the pattern occurs, or that it does not', () => {
    expect(lastFrame(solve('ABCABC', 'BC')).explanation).toMatch(/occurs at 1, 4/);
    expect(lastFrame(solve('AAAA', 'B')).explanation).toMatch(/does not occur/);
  });

  it('rejects a pattern longer than the text, and over-long input', () => {
    expect(kmp.build({ text: 'AB', pattern: 'ABC' }).ok).toBe(false);
    expect(kmp.build({ text: 'A'.repeat(MAX_TEXT + 1), pattern: 'A' }).ok).toBe(false);
    expect(kmp.build({ text: 'A'.repeat(MAX_TEXT), pattern: 'A'.repeat(MAX_PATTERN + 1) }).ok).toBe(false);
  });
});

describe('kmp: never backing up', () => {
  it('moves i through the text only forwards', () => {
    const frames = solve('AABAACAADAABAABA', 'AABA').filter((frame) => frame.phase === 'search');
    let furthest = -1;
    for (const frame of frames) {
      const i = indexPointer(frame, 'i');
      if (i === undefined) continue;
      expect(i).toBeGreaterThanOrEqual(furthest);
      furthest = i;
    }
  });

  it('keeps within 2n search and 2m prefix comparisons', () => {
    const rng = makeRng(7);
    for (let trial = 0; trial < 100; trial++) {
      const n = randomInt(rng, 2, MAX_TEXT);
      const m = randomInt(rng, 1, Math.min(n, MAX_PATTERN));
      const text = randomString(rng, n, 'AB');
      const pattern = randomString(rng, m, 'AB');
      const { extra, comparisons } = lastFrame(solve(text, pattern)).counters;
      const search = extra['search comparisons'] ?? 0;
      const prefix = extra['prefix comparisons'] ?? 0;
      expect(search).toBeLessThanOrEqual(2 * n);
      expect(prefix).toBeLessThanOrEqual(2 * m);
      expect(comparisons).toBe(search + prefix);
    }
  });

  it('slides the pattern by its own ids, so a slide animates rather than redraws', () => {
    const frames = solve('ABABDABACDABABCABAB', 'ABABCABAB').filter((frame) => frame.phase === 'search');
    for (const frame of frames) {
      const view = arrayOf(frame).auxiliary;
      if (view === undefined) continue;
      for (let at = view.activeFrom; at <= view.activeTo; at++) {
        expect(view.elements[at]?.id).toBe(at - view.activeFrom);
      }
    }
  });

  it('captions every pattern tile in the search with its pi', () => {
    const frames = solve('ABABDABACDABABCABAB', 'ABABCABAB');
    const first = frames.find((frame) => frame.phase === 'search');
    const view = arrayOf(first).auxiliary;
    expect(view?.elements.slice(0, 9).map((element) => element.note)).toEqual(['0', '0', '1', '2', '0', '1', '2', '3', '4']);
    expect(lettersOf(first as Frame).join('')).toBe('ABABDABACDABABCABAB');
  });
});

describe('kmp: frame contract', () => {
  it('keeps the frame contract on the presets and on edge cases', () => {
    const cases: Array<[string, string]> = [
      ['ABABDABACDABABCABAB', 'ABABCABAB'],
      ['AAAAAAAAAA', 'AAA'],
      ['AAABAAABAAAB', 'AAAA'],
      ['ABC', 'ABC'],
      ['A', 'A'],
      ['ABCDEFGH', 'XYZ'],
      ['ABABABABABAB', 'ABABAB'],
    ];
    for (const [text, pattern] of cases) expectFrameHygiene(kmp, solve(text, pattern), HYGIENE);
  });

  it('builds every preset', () => {
    const rng = makeRng(3);
    for (const preset of kmp.presets) {
      for (const size of [4, 12, MAX_TEXT]) {
        const params = preset.build(size, rng);
        const result = kmp.build(params);
        expect(result.ok, `${preset.id} at ${size}`).toBe(true);
        if (result.ok) expectFrameHygiene(kmp, result.frames, HYGIENE);
      }
    }
  });

  it('is deterministic and honours its input contract', () => {
    expectDeterministic(kmp, {});
    expectInputContract(kmp);
  });
});
