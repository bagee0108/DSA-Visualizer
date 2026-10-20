import { describe, expect, it } from 'vitest';

import { bellmanFord } from '../algorithms/graphs/bellmanFord';
import { runFrames } from '../algorithms/frameHygiene';
import type { Frame } from '../core/types';
import { phaseEndIndex } from './phaseJump';

function frames(phases: readonly (string | undefined)[]): Frame[] {
  return phases.map((phase) => ({ phase }) as unknown as Frame);
}

describe('jump to the end of the phase', () => {
  it('goes to the last frame of the current phase, then to the end of the next', () => {
    const run = frames(['a', 'a', 'a', 'b', 'b', 'c']);
    expect(phaseEndIndex(run, 0)).toBe(2);
    expect(phaseEndIndex(run, 1)).toBe(2);
    expect(phaseEndIndex(run, 2)).toBe(4);
    expect(phaseEndIndex(run, 4)).toBe(5);
    expect(phaseEndIndex(run, 5)).toBe(5);
  });

  it('copes with frames that have no phase and with an empty run', () => {
    expect(phaseEndIndex(frames([undefined, undefined, 'x']), 0)).toBe(1);
    expect(phaseEndIndex([], 3)).toBe(0);
  });

  it('walks a Bellman-Ford run one pass per press, ending each on the last edge it relaxes', () => {
    const run = runFrames(bellmanFord, {});
    const landed: string[] = [];
    for (let at = 0, next = phaseEndIndex(run, 0); at < run.length - 1; at = next, next = phaseEndIndex(run, at)) {
      const frame = run[next];
      if (frame === undefined) break;
      landed.push(frame.phase ?? '');
      // Each landing is the last frame of its pass: the next frame starts another phase, or the run is over.
      expect(next === run.length - 1 || run[next + 1]?.phase !== frame.phase).toBe(true);
    }
    expect(landed[0]).toMatch(/^pass 1 of /);
    expect(new Set(landed).size).toBe(landed.length);
  });
});
