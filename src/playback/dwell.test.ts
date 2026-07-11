import { describe, expect, it } from 'vitest';

import { ZERO_COUNTERS, type Frame } from '../core/types';
import {
  BASE_DWELL_MS,
  MAX_DWELL_MS,
  MIN_DWELL_MS,
  MS_PER_WORD,
  explanationWordCount,
  frameDwellMs,
} from './dwell';

function frameWith(explanation: string): Frame {
  return {
    structure: { kind: 'array', elements: [], regions: [] },
    highlights: {},
    pointers: {},
    callStack: [],
    explanation,
    codeLine: 1,
    counters: ZERO_COUNTERS,
  };
}

describe('frame dwell', () => {
  it('counts words in the explanation', () => {
    expect(explanationWordCount(frameWith('Sorted.'))).toBe(1);
    expect(explanationWordCount(frameWith('  a[3] = 27  is  below the pivot '))).toBe(7);
    expect(explanationWordCount(frameWith(''))).toBe(0);
  });

  it('gives a terse frame the floor duration', () => {
    expect(frameDwellMs(frameWith('Sorted.'), 1)).toBe(MIN_DWELL_MS);
  });

  it('scales with explanation length', () => {
    const short = frameDwellMs(frameWith('one two three four five'), 1);
    const long = frameDwellMs(frameWith('one two three four five six seven eight nine ten'), 1);
    expect(long).toBeGreaterThan(short);
    expect(long - short).toBeCloseTo(5 * MS_PER_WORD, 5);
  });

  it('holds a typical explanation long enough to read', () => {
    const typical = frameWith('a[5] = 27 is below the pivot 45 so it moves left');
    const dwell = frameDwellMs(typical, 1);
    expect(dwell).toBeGreaterThan(1000);
    expect(dwell).toBeLessThanOrEqual(MAX_DWELL_MS);
  });

  it('caps a very wordy frame', () => {
    const wordy = frameWith(Array.from({ length: 200 }, () => 'word').join(' '));
    expect(frameDwellMs(wordy, 1)).toBe(MAX_DWELL_MS);
  });

  it('divides by the speed multiplier', () => {
    const frame = frameWith('one two three four five six seven eight');
    const base = BASE_DWELL_MS + 8 * MS_PER_WORD;
    expect(frameDwellMs(frame, 1)).toBeCloseTo(base, 5);
    expect(frameDwellMs(frame, 4)).toBeCloseTo(base / 4, 5);
    expect(frameDwellMs(frame, 16)).toBeCloseTo(base / 16, 5);
    expect(frameDwellMs(frame, 0.25)).toBeCloseTo(base * 4, 5);
  });

  it('stays above one animation frame even at the 16x ceiling', () => {
    expect(frameDwellMs(frameWith('Sorted.'), 16)).toBeGreaterThan(16);
  });

  it('never returns zero or a negative duration', () => {
    for (const speed of [0, -1, 0.25, 1, 4, 16]) {
      expect(frameDwellMs(frameWith('hi'), speed)).toBeGreaterThan(0);
    }
  });
});
