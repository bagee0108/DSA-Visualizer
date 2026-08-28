import { describe, expect, it } from 'vitest';

import { fractionFor, progressKey, rememberFrameCount } from './buildProgress';

describe('build progress', () => {
  it('never goes backwards, whatever the estimate turns out to be', () => {
    const key = progressKey('never-built', 40);
    let previous = -1;
    for (let drained = 0; drained <= 20000; drained += 7) {
      const fraction = fractionFor(key, drained);
      expect(fraction, `at ${drained}`).toBeGreaterThanOrEqual(previous);
      expect(fraction).toBeLessThanOrEqual(1);
      previous = fraction;
    }
  });

  it('approaches but never reaches one, so a finished bar means finished', () => {
    const key = progressKey('asymptote', 9);
    rememberFrameCount(key, 500);
    expect(fractionFor(key, 500)).toBeGreaterThan(0.9);
    expect(fractionFor(key, 5000)).toBeLessThan(1);
    expect(fractionFor(key, 10 ** 7)).toBeLessThanOrEqual(0.99);
  });

  it('uses the last count for this algorithm and size once it knows one', () => {
    const key = progressKey('remembered', 64);
    const blind = fractionFor(key, 100);
    rememberFrameCount(key, 200);
    const informed = fractionFor(key, 100);
    expect(informed, 'half of a 200-frame run reads as about half').toBeCloseTo(0.5, 1);
    expect(informed).toBeGreaterThan(blind);
  });

  it('keys separately per algorithm and per size', () => {
    rememberFrameCount(progressKey('bfs', 10), 100);
    rememberFrameCount(progressKey('bfs', 150), 8000);
    expect(fractionFor(progressKey('bfs', 10), 90)).toBeGreaterThan(
      fractionFor(progressKey('bfs', 150), 90),
    );
  });

  it('starts at zero', () => {
    expect(fractionFor(progressKey('anything', 1), 0)).toBe(0);
  });
});
