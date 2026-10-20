import { describe, expect, it } from 'vitest';

import { formatNumberList } from '../core/arrayInput';
import { makeRng } from '../core/random';
import { valuesOf } from '../algorithms/frameHygiene';
import {
  frameIndexAt,
  LESSON_PRESET,
  MAX_RACE_ELEMENTS,
  nextEvent,
  opsOf,
  parseRace,
  previousEvent,
  RACE_DEFAULTS,
  RACE_PRESETS,
  RACERS,
  raceTotal,
  sideParams,
  trackOf,
  type Track,
} from './race';

function track(algorithmId: string, values: readonly number[]): Track {
  const algorithm = RACERS.find((candidate) => candidate.meta.id === algorithmId);
  if (algorithm === undefined) throw new Error(algorithmId);
  const result = algorithm.build(sideParams(algorithm, values));
  if (!result.ok) throw new Error(result.error);
  return trackOf(result.frames);
}

const sorted = Array.from({ length: 100 }, (_, i) => i + 1);

describe('race: input', () => {
  it('runs its defaults', () => {
    const parsed = parseRace({});
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect([parsed.value.left.meta.id, parsed.value.right.meta.id]).toEqual([RACE_DEFAULTS.a, RACE_DEFAULTS.b]);
  });

  it('caps the input at 100 elements and names the racers it knows', () => {
    const tooMany = parseRace({ input: formatNumberList(Array.from({ length: MAX_RACE_ELEMENTS + 1 }, (_, i) => i)) });
    expect(tooMany.ok).toBe(false);
    const unknown = parseRace({ a: 'bogosort' });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error).toContain('insertion sort');
  });

  it('offers random, sorted, reversed, nearly sorted and few unique', () => {
    expect(RACE_PRESETS.map((preset) => preset.id)).toEqual(['random', 'sorted', 'reversed', 'nearly', 'few-unique']);
    expect(LESSON_PRESET).toMatchObject({ a: 'quicksort', b: 'insertion-sort', input: 'sorted' });
  });

  it('builds each side from its own level defaults, so quicksort pivots on the last element', () => {
    const quick = RACERS[0];
    if (quick === undefined) throw new Error('no racers');
    expect(sideParams(quick, [3, 1, 2])).toMatchObject({ pivot: 'last', input: '3, 1, 2' });
  });
});

describe('race: the operation clock', () => {
  it('shows each side its last frame at or before the clock, never one ahead of it', () => {
    const left = track('quicksort', [5, 3, 8, 1, 9, 2, 7]);
    for (let clock = 0; clock <= left.total + 3; clock++) {
      const at = frameIndexAt(left, clock);
      expect(left.ops[at] ?? 0).toBeLessThanOrEqual(Math.max(clock, left.ops[0] ?? 0));
      const after = left.ops[at + 1];
      if (after !== undefined) expect(after).toBeGreaterThan(clock);
    }
  });

  it('holds a finished side on its final, sorted frame', () => {
    const insertion = track('insertion-sort', sorted);
    const quick = track('quicksort', sorted);
    const total = raceTotal([insertion, quick]);
    expect(total).toBe(quick.total);
    const held = insertion.frames[frameIndexAt(insertion, total)];
    expect(held).toBe(insertion.frames[insertion.frames.length - 1]);
    expect(held === undefined ? [] : valuesOf(held)).toEqual(sorted);
  });

  it('plays the lesson: insertion sort finishes sorted input in 198 operations, quicksort needs thousands', () => {
    expect(track('insertion-sort', sorted).total).toBe(198);
    expect(track('quicksort', sorted).total).toBeGreaterThan(10000);
  });

  it('steps from one operation boundary to the next on either side, and back', () => {
    const rng = makeRng(4);
    const values = Array.from({ length: 12 }, () => Math.floor(rng() * 50));
    const tracks = [track('mergesort', values), track('heapsort', values)];
    const boundaries = new Set(tracks.flatMap((one) => one.ops));
    let clock = 0;
    const seen: number[] = [];
    for (let next = nextEvent(tracks, clock); next !== null; next = nextEvent(tracks, clock)) {
      expect(next).toBeGreaterThan(clock);
      expect(boundaries.has(next)).toBe(true);
      seen.push(next);
      clock = next;
    }
    expect(clock).toBe(raceTotal(tracks));
    for (let at = seen.length - 1; at > 0; at--) expect(previousEvent(tracks, seen[at] ?? 0)).toBe(seen[at - 1]);
    expect(previousEvent(tracks, seen[0] ?? 0)).toBe(0);
  });

  it('counts an operation as a comparison or a write', () => {
    const frame = track('insertion-sort', [2, 1]).frames.at(-1);
    if (frame === undefined) throw new Error('no frames');
    expect(opsOf(frame)).toBe(frame.counters.comparisons + frame.counters.writes);
  });
});
