import { describe, expect, it } from 'vitest';

import { makeRng } from '../../core/random';
import type { Frame } from '../../core/types';
import { expectDeterministic, expectFrameHygiene, expectInputContract, lastFrame, runFrames, treeOf } from '../frameHygiene';
import { outputLabels } from './treeTestkit';
import { trie } from './trie';

function run(words: readonly string[], ops: string): readonly Frame[] {
  return runFrames(trie, { input: words.join(', '), ops });
}

function matches(frames: readonly Frame[]): string[] {
  const last = [...frames].reverse().find((frame) => frame.phase === 'search');
  if (last === undefined) throw new Error('no search in run');
  return outputLabels(last, 'matches');
}

function reference(words: readonly string[], prefix: string): string[] {
  return [...new Set(words)].filter((word) => word.startsWith(prefix)).sort();
}

describe('trie: prefix search', () => {
  it('returns every stored word with the prefix, sorted, and nothing else', () => {
    const words = ['car', 'card', 'care', 'cart', 'cat', 'dog', 'dot'];
    for (const prefix of ['car', 'ca', 'c', 'do', 'cart', 'd']) {
      expect(matches(run(words, `search ${prefix}`)), `prefix ${prefix}`).toEqual(reference(words, prefix));
    }
  });

  it('returns nothing for a prefix that leaves the trie', () => {
    const words = ['car', 'cat'];
    expect(matches(run(words, 'search x'))).toEqual([]);
    expect(matches(run(words, 'search cab'))).toEqual([]);
    const frames = run(words, 'search cab');
    expect(frames.some((frame) => /no stored word starts with/.test(frame.explanation))).toBe(true);
  });

  it('agrees with a reference across random word sets', () => {
    const rng = makeRng(4444);
    const alphabet = 'abc';
    for (let trial = 0; trial < 40; trial++) {
      const words = Array.from({ length: 4 + Math.floor(rng() * 8) }, () =>
        Array.from({ length: 1 + Math.floor(rng() * 4) }, () => alphabet[Math.floor(rng() * alphabet.length)] ?? 'a').join(''),
      );
      const prefix = Array.from({ length: 1 + Math.floor(rng() * 2) }, () => alphabet[Math.floor(rng() * alphabet.length)] ?? 'a').join('');
      expect(matches(run(words, `search ${prefix}`)), `words=${words.join(',')} prefix=${prefix}`).toEqual(reference(words, prefix));
    }
  });

  it('distinguishes a word from a prefix of a longer word', () => {
    expect(matches(run(['card'], 'search car'))).toEqual(['card']);
    expect(matches(run(['car', 'card'], 'search car'))).toEqual(['car', 'card']);
    const frames = run(['card'], 'search ca');
    const final = treeOf(lastFrame(frames));
    const terminals = final.nodes.filter((node) => node.terminal === true);
    expect(terminals).toHaveLength(1);
    expect(terminals[0]?.label).toBe('d');
  });
});

describe('trie: structure', () => {
  it('shares prefixes: node count is distinct prefixes plus the root', () => {
    const final = treeOf(lastFrame(run(['car', 'card', 'cart', 'cat'], 'search c')));
    expect(final.nodes).toHaveLength(7);
    expect(final.arity).toBe('nary');
  });

  it('marks exactly the inserted words as terminal', () => {
    const words = ['in', 'inn', 'ink', 'into'];
    const final = treeOf(lastFrame(run(words, 'search i')));
    expect(final.nodes.filter((node) => node.terminal === true)).toHaveLength(words.length);
    expect(lastFrame(run(words, 'search i')).counters.extra.words).toBe(words.length);
  });

  it('inserting a duplicate word adds no nodes', () => {
    const once = treeOf(lastFrame(run(['apple'], 'search a'))).nodes.length;
    const twice = treeOf(lastFrame(run(['apple', 'apple'], 'search a'))).nodes.length;
    expect(twice).toBe(once);
  });

  it('costs the length of the string, not the size of the trie', () => {
    const many = Array.from({ length: 30 }, (_, i) => `w${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + ((i * 7) % 26))}`.replace(/[^a-z]/g, 'q'));
    const small = run(['zzz'], 'search zzz');
    const large = run([...many, 'zzz'], 'search zzz');
    const cost = (frames: readonly Frame[]): number => {
      const start = frames.findIndex((frame) => frame.phase === 'search');
      const before = frames[start - 1]?.counters.comparisons ?? 0;
      return lastFrame(frames).counters.comparisons - before;
    };
    expect(cost(large)).toBe(cost(small));
  });
});

describe('trie: frame hygiene', () => {
  it('holds every structural invariant', () => {
    expectFrameHygiene(trie, runFrames(trie, {}));
  });

  it('is deterministic', () => {
    expectDeterministic(trie, { input: 'a, ab, abc', ops: 'search ab' });
  });

  it('honours its input contract', () => {
    expectInputContract(trie);
  });

  it('rejects non-letter words with a reason', () => {
    const result = trie.build({ input: 'car, c4r' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/letters a-z/);
  });

  it('accepts shorthand operations', () => {
    expect(matches(run(['cat'], '+car; ?ca'))).toEqual(['car', 'cat']);
  });
});
