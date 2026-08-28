/**
 * Drives an incremental build across animation frames. The scheduler is
 * injectable so the drain can be tested without a browser clock.
 */

import type { BuildResult, IncrementalBuild } from '../core/define';

/** Slice length. Frame cost varies enough between a 12-key BST and a 150-node
 *  Dijkstra that a fixed frame count would either stutter or crawl. */
export const BUDGET_MS = 8;

export interface Scheduler {
  readonly schedule: (callback: () => void) => number;
  readonly cancel: (handle: number) => void;
}

export interface RunnerOptions {
  readonly onDone: (result: BuildResult) => void;
  readonly onProgress?: (drained: number) => void;
  readonly budgetMs?: number;
  readonly scheduler?: Scheduler;
}

export interface Runner {
  /** Abandons the build. Nothing is delivered after this returns. */
  readonly cancel: () => void;
}

const animationFrames: Scheduler = {
  schedule: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export function runChunked(build: IncrementalBuild, options: RunnerOptions): Runner {
  const scheduler = options.scheduler ?? animationFrames;
  const budgetMs = options.budgetMs ?? BUDGET_MS;

  let handle: number | null = null;
  let cancelled = false;

  const pump = (): void => {
    handle = null;
    if (cancelled) return;

    const chunk = build.step(budgetMs);
    // Checked again: a build superseded while its slice was running must not
    // deliver frames into the run that replaced it.
    if (cancelled) return;

    if (chunk.done && chunk.result !== null) {
      options.onDone(chunk.result);
      return;
    }

    options.onProgress?.(chunk.drained);
    handle = scheduler.schedule(pump);
  };

  handle = scheduler.schedule(pump);

  return {
    cancel(): void {
      cancelled = true;
      if (handle !== null) {
        scheduler.cancel(handle);
        handle = null;
      }
    },
  };
}
