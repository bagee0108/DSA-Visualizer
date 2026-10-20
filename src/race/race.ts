/**
 * Race mode: two sorts on one input, on one clock that counts operations
 * (comparisons plus array writes), not frames. Each side shows its last frame
 * at or before the clock; a side that has finished holds its final frame. The
 * generators are the levels' own, unchanged. See CONTRIBUTING "Race mode".
 */

import { heapsort } from '../algorithms/arrays/heapsort';
import { insertionSort } from '../algorithms/arrays/insertionSort';
import { mergesort } from '../algorithms/arrays/mergesort';
import { quicksort } from '../algorithms/arrays/quicksort';
import { arrayPresets, formatNumberList, parseNumberList } from '../core/arrayInput';
import type { ParamMap, ParseResult, PresetSpec, RegisteredAlgorithm } from '../core/define';
import { makeRng, shuffle } from '../core/random';
import type { Frame } from '../core/types';

export const RACE_ID = 'race-mode';
/** The most elements a race takes: quadratic sorts on more would run past a watchable length. */
export const MAX_RACE_ELEMENTS = 100;
export const MIN_RACE_ELEMENTS = 4;

export const RACERS: readonly RegisteredAlgorithm[] = [quicksort, mergesort, heapsort, insertionSort];

export function racer(id: string | undefined): RegisteredAlgorithm | undefined {
  return RACERS.find((algorithm) => algorithm.meta.id === id);
}

/** Operations at 1x, per second of play; the speed control multiplies it. */
export const OPS_PER_SECOND = 40;

export interface RaceInput {
  readonly left: RegisteredAlgorithm;
  readonly right: RegisteredAlgorithm;
  readonly values: readonly number[];
}

const DEFAULT_VALUES = shuffle(
  Array.from({ length: 40 }, (_, at) => at + 1),
  makeRng(33),
);

export const RACE_DEFAULTS: ParamMap = {
  a: 'quicksort',
  b: 'insertion-sort',
  input: formatNumberList(DEFAULT_VALUES),
};

export function parseRace(params: ParamMap): ParseResult<RaceInput> {
  const merged = { ...RACE_DEFAULTS, ...params };
  const left = racer(merged.a);
  const right = racer(merged.b);
  const names = RACERS.map((algorithm) => algorithm.meta.name.toLowerCase()).join(', ');
  if (left === undefined || right === undefined) return { ok: false, error: `Pick two of: ${names}.` };
  const values = parseNumberList(merged.input ?? '', { label: 'Array', maxLength: MAX_RACE_ELEMENTS });
  if (!values.ok) return values;
  return { ok: true, value: { left, right, values: values.value } };
}

/** The params one side is built from: its level's defaults (quicksort pivots on the last element) and the shared input. */
export function sideParams(algorithm: RegisteredAlgorithm, values: readonly number[]): ParamMap {
  return { ...algorithm.defaults, input: formatNumberList(values) };
}

/** The race's input presets: the array levels' own, minus organ pipe, plus the one-click lesson. */
export const RACE_PRESETS: readonly PresetSpec[] = arrayPresets.filter((preset) => preset.id !== 'organpipe');

/** Quicksort with the last element as pivot on sorted input, against insertion sort: quadratic against linear. */
export const LESSON_PRESET = { id: 'lesson', label: 'Quicksort vs insertion sort, sorted', a: 'quicksort', b: 'insertion-sort', input: 'sorted' } as const;

/* ---------------- the operation clock ---------------- */

export function opsOf(frame: Frame): number {
  return frame.counters.comparisons + frame.counters.writes;
}

export interface Track {
  readonly frames: readonly Frame[];
  /** Operations done by each frame, never decreasing. */
  readonly ops: readonly number[];
  readonly total: number;
}

export function trackOf(frames: readonly Frame[]): Track {
  const ops = frames.map(opsOf);
  return { frames, ops, total: ops[ops.length - 1] ?? 0 };
}

/** The last frame at or before the clock: the frame the side shows. */
export function frameIndexAt(track: Track, clock: number): number {
  let lo = 0;
  let hi = track.ops.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((track.ops[mid] ?? 0) <= clock) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function raceTotal(tracks: readonly Track[]): number {
  return tracks.reduce((max, track) => Math.max(max, track.total), 0);
}

/** The next clock value at which either side shows a new frame, or null at the end. */
export function nextEvent(tracks: readonly Track[], clock: number): number | null {
  let best: number | null = null;
  for (const track of tracks) {
    const at = track.ops.find((ops) => ops > clock);
    if (at !== undefined && (best === null || at < best)) best = at;
  }
  return best;
}

/** The previous such clock value, or 0. */
export function previousEvent(tracks: readonly Track[], clock: number): number {
  let best = 0;
  for (const track of tracks) {
    for (let at = track.ops.length - 1; at >= 0; at--) {
      const ops = track.ops[at] ?? 0;
      if (ops < clock) {
        if (ops > best) best = ops;
        break;
      }
    }
  }
  return best;
}
