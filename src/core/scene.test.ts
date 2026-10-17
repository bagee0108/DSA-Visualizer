import { describe, expect, it } from 'vitest';

import { arrayOf, expectFrameHygiene, lettersOf, runFrames, valuesOf } from '../algorithms/frameHygiene';
import { defineAlgorithm, type AlgorithmDefinition } from './define';
import { ArrayScene } from './scene';

interface SlideInput {
  readonly text: string;
  readonly pattern: string;
}

/** A pattern slid along a text, the way a string matcher will draw it. */
const slideDefinition: AlgorithmDefinition<SlideInput> = {
  meta: {
    id: 'letters-test',
    name: 'Letters',
    category: 'strings',
    structureKind: 'array',
    blurb: 'Test fixture.',
    complexity: { time: { best: 'O(n)', average: 'O(n)', worst: 'O(n)' }, space: 'O(1)' },
    code: 'slide()',
    trackedCounters: ['comparisons'],
  },
  fields: [
    { key: 'text', label: 'Text', kind: 'text', defaultValue: 'abcab' },
    { key: 'pattern', label: 'Pattern', kind: 'text', defaultValue: 'ab' },
  ],
  parse: (params) => ({ ok: true, value: { text: params.text ?? 'abcab', pattern: params.pattern ?? 'ab' } }),
  *run({ text, pattern }) {
    const scene = new ArrayScene<string>([...text]);
    for (let at = 0; at + pattern.length <= text.length; at++) {
      scene.placeAux('pattern', [...pattern], at);
      scene.compareValue(at, pattern[0] ?? '');
      yield scene.frame({ explanation: `shift ${at}`, codeLine: 1, highlights: { comparing: [at, `aux:${at}`] }, pointers: { s: at } });
    }
  },
};
const slide = defineAlgorithm(slideDefinition);

describe('ArrayScene over letters', () => {
  it('holds strings and orders them as strings', () => {
    const scene = new ArrayScene<string>([...'kmp']);
    expect(scene.compare(0, 1)).toBe(-1);
    expect(scene.compare(2, 1)).toBe(1);
    expect(scene.compareValue(0, 'k')).toBe(0);
    scene.write(1, 'x');
    expect(scene.toArray()).toEqual(['k', 'x', 'p']);
    expect(scene.counters().comparisons).toBe(3);
  });

  it('places aux values at an offset, keyed by their own positions so a shift slides them', () => {
    const scene = new ArrayScene<string>([...'abcabd']);
    scene.placeAux('pattern', [...'abd'], 0);
    const first = arrayOf(scene.frame({ explanation: '', codeLine: 1 })).auxiliary;
    scene.placeAux('pattern', [...'abd'], 3);
    const second = arrayOf(scene.frame({ explanation: '', codeLine: 1 })).auxiliary;

    expect([first?.activeFrom, first?.activeTo]).toEqual([0, 2]);
    expect([second?.activeFrom, second?.activeTo]).toEqual([3, 5]);
    expect(second?.elements.slice(3).map((element) => element.value)).toEqual(['a', 'b', 'd']);
    expect(second?.elements.slice(3).map((element) => element.id)).toEqual([0, 1, 2]);
    expect(first?.elements.slice(0, 3).map((element) => element.id)).toEqual([0, 1, 2]);
  });

  it('does not count placing aux values as work', () => {
    const scene = new ArrayScene<string>([...'abc']);
    scene.placeAux('pattern', ['b'], 1);
    const { reads, writes } = scene.counters();
    expect([reads, writes]).toEqual([0, 0]);
  });

  it('refuses aux values that run off either end', () => {
    const scene = new ArrayScene<string>([...'abc']);
    expect(() => scene.placeAux('pattern', [...'ab'], 2)).toThrow(RangeError);
    expect(() => scene.placeAux('pattern', ['a'], -1)).toThrow(RangeError);
    expect(() => scene.placeAux('pattern', [], 0)).toThrow(RangeError);
  });

  it('still copies numbers to aux as before', () => {
    const scene = new ArrayScene([5, 3, 8]);
    scene.copyToAux('copy', 0, 2);
    const aux = arrayOf(scene.frame({ explanation: '', codeLine: 1 })).auxiliary;
    expect(aux?.elements.map((element) => element.value)).toEqual([5, 3, 8]);
    expect(scene.counters().writes).toBe(3);
  });
});

describe('letter frames', () => {
  it('pass frame hygiene', () => {
    expectFrameHygiene(slide, runFrames(slide, { text: 'abcabd', pattern: 'abd' }));
  });

  it('read back through lettersOf, and valuesOf refuses them', () => {
    const frame = runFrames(slide, { text: 'abc', pattern: 'b' })[0];
    if (frame === undefined) throw new Error('no frame');
    expect(lettersOf(frame)).toEqual(['a', 'b', 'c']);
    expect(() => valuesOf(frame)).toThrow();
  });

  it('fail hygiene when a tile label is too long to draw', () => {
    const long = defineAlgorithm<SlideInput>({
      ...slideDefinition,
      *run() {
        yield new ArrayScene<string>(['a', 'abcd']).frame({ explanation: '', codeLine: 1 });
      },
    });
    expect(() => expectFrameHygiene(long, runFrames(long, {}))).toThrow();
  });
});
