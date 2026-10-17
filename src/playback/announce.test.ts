import { describe, expect, it } from 'vitest';

import { ZERO_COUNTERS, type Frame } from '../core/types';
import { createAnnouncer, type AnnounceView } from './announce';

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

const FRAMES = Array.from({ length: 150 }, (_, i) => frameWith(`Step ${i + 1}.`));

function view(index: number, playing: boolean): AnnounceView {
  return { frame: FRAMES[index] ?? null, index, count: FRAMES.length, playing };
}

/** Feeds a run of views and keeps every write the live region would get. */
function writes(views: readonly AnnounceView[]): string[] {
  const announce = createAnnouncer();
  const out: string[] = [];
  for (const v of views) {
    const text = announce(v);
    if (text !== null) out.push(text);
  }
  return out;
}

describe('live region announcements', () => {
  it('stays silent on the first render', () => {
    expect(writes([view(0, false)])).toEqual([]);
  });

  it('writes nothing through 100 frames of playback, then exactly once on stop', () => {
    const run = [view(0, false), view(0, true)];
    for (let i = 1; i <= 100; i++) run.push(view(i, true));
    const playing = writes(run);
    expect(playing).toEqual([]);

    const stopped = writes([...run, view(100, false)]);
    expect(stopped).toEqual(['Frame 101 of 150. Step 101.']);
  });

  it('writes once per step, scrub or jump while paused', () => {
    const out = writes([view(0, false), view(1, false), view(2, false), view(40, false), view(149, false)]);
    expect(out).toEqual([
      'Frame 2 of 150. Step 2.',
      'Frame 3 of 150. Step 3.',
      'Frame 41 of 150. Step 41.',
      'Frame 150 of 150. Step 150.',
    ]);
  });

  it('writes once when playback runs to the end', () => {
    const run = [view(0, false), view(0, true), view(148, true), view(149, true), view(149, false)];
    expect(writes(run)).toEqual(['Frame 150 of 150. Step 150.']);
  });

  it('writes once when a step interrupts playback', () => {
    expect(writes([view(0, false), view(5, true), view(6, false)])).toEqual(['Frame 7 of 150. Step 7.']);
  });

  it('does not repeat itself on a re-render with nothing changed', () => {
    expect(writes([view(0, false), view(3, false), view(3, false), view(3, false)])).toHaveLength(1);
  });
});
