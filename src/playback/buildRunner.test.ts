import { describe, expect, it } from 'vitest';

import { dijkstra } from '../algorithms/graphs/dijkstra';
import { quicksort } from '../algorithms/arrays/quicksort';
import type { BuildResult } from '../core/define';
import { makeRng } from '../core/random';
import { runChunked, type Scheduler } from './buildRunner';

/** Big enough that the drain genuinely spans many slices. */
const SLOW = dijkstra.presets[0]?.build(120, makeRng(4)) ?? {};

/** A scheduler the test drives by hand, so no clock or browser is involved. */
function manual(): {
  readonly scheduler: Scheduler;
  readonly pending: () => number;
  readonly tick: () => void;
  readonly drain: (limit?: number) => void;
} {
  const queue = new Map<number, () => void>();
  let next = 1;

  const tick = (): void => {
    const due = [...queue.entries()];
    queue.clear();
    for (const [, callback] of due) callback();
  };

  return {
    scheduler: {
      schedule: (callback) => {
        const handle = next++;
        queue.set(handle, callback);
        return handle;
      },
      cancel: (handle) => {
        queue.delete(handle);
      },
    },
    pending: () => queue.size,
    tick,
    drain: (limit = 100000) => {
      for (let i = 0; i < limit && queue.size > 0; i++) tick();
    },
  };
}

describe('chunked build runner', () => {
  it('delivers the finished run once, through the scheduler', () => {
    const clock = manual();
    const delivered: BuildResult[] = [];
    runChunked(quicksort.startBuild({}), {
      budgetMs: 0,
      scheduler: clock.scheduler,
      onDone: (result) => delivered.push(result),
    });

    expect(delivered, 'nothing runs before the first slice is scheduled').toHaveLength(0);
    clock.drain();
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.ok).toBe(true);
    expect(clock.pending(), 'no work left scheduled').toBe(0);
  });

  it('never resolves a build that was cancelled mid-flight', () => {
    const clock = manual();
    let done = 0;
    const progress: number[] = [];
    const runner = runChunked(dijkstra.startBuild(SLOW), {
      budgetMs: 0,
      scheduler: clock.scheduler,
      onProgress: (drained) => progress.push(drained),
      onDone: () => {
        done += 1;
      },
    });

    clock.tick();
    clock.tick();
    expect(progress.length, 'the build really was in flight').toBeGreaterThan(0);
    expect(done).toBe(0);

    runner.cancel();
    clock.drain();

    expect(done, 'a cancelled build delivers nothing').toBe(0);
    expect(clock.pending(), 'and leaves nothing scheduled').toBe(0);
  });

  it('runs nothing at all when cancelled before its first slice', () => {
    const clock = manual();
    let touched = 0;
    const runner = runChunked(quicksort.startBuild({}), {
      budgetMs: 0,
      scheduler: clock.scheduler,
      onProgress: () => {
        touched += 1;
      },
      onDone: () => {
        touched += 1;
      },
    });

    runner.cancel();
    clock.drain();
    expect(touched).toBe(0);
  });

  it('lets the superseding build resolve and keeps the superseded one out', () => {
    const clock = manual();
    const resolved: string[] = [];

    const first = runChunked(dijkstra.startBuild(SLOW), {
      budgetMs: 0,
      scheduler: clock.scheduler,
      onDone: () => resolved.push('first'),
    });
    clock.tick();

    // New params arrive: the old build is abandoned and a new one starts.
    first.cancel();
    runChunked(quicksort.startBuild({}), {
      budgetMs: 0,
      scheduler: clock.scheduler,
      onDone: () => resolved.push('second'),
    });
    clock.drain();

    expect(resolved).toEqual(['second']);
  });

  it('cancelling after completion changes nothing', () => {
    const clock = manual();
    let done = 0;
    const runner = runChunked(quicksort.startBuild({}), {
      budgetMs: 0,
      scheduler: clock.scheduler,
      onDone: () => {
        done += 1;
      },
    });
    clock.drain();
    runner.cancel();
    clock.drain();
    expect(done).toBe(1);
  });

  it('reports progress that only ever grows', () => {
    const clock = manual();
    const progress: number[] = [];
    runChunked(dijkstra.startBuild(SLOW), {
      budgetMs: 0,
      scheduler: clock.scheduler,
      onProgress: (drained) => progress.push(drained),
      onDone: () => undefined,
    });
    clock.drain();

    expect(progress.length).toBeGreaterThan(1);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i] ?? 0).toBeGreaterThanOrEqual(progress[i - 1] ?? 0);
    }
  });
});
