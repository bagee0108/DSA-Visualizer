import { describe, expect, it } from 'vitest';

import { avl } from '../algorithms/trees/avl';
import { dijkstra } from '../algorithms/graphs/dijkstra';
import { quicksort } from '../algorithms/arrays/quicksort';
import type { BuildResult, ParamMap, RegisteredAlgorithm } from './define';

interface Chunked {
  readonly result: BuildResult;
  readonly chunks: number;
}

/** Drains with a zero budget, so it yields at every clock check. */
function drainInChunks(algorithm: RegisteredAlgorithm, params: ParamMap): Chunked {
  const build = algorithm.startBuild(params);
  for (let chunks = 1; chunks <= 200000; chunks++) {
    const step = build.step(0);
    if (step.done && step.result !== null) return { result: step.result, chunks };
  }
  throw new Error('chunked build did not finish');
}

function framesOf(result: BuildResult): readonly unknown[] {
  if (!result.ok) throw new Error(`build failed: ${result.error}`);
  return result.frames;
}

const CASES: ReadonlyArray<readonly [string, RegisteredAlgorithm, ParamMap]> = [
  ['array', quicksort, {}],
  ['tree', avl, {}],
  ['graph', dijkstra, {}],
];

describe('chunked build', () => {
  it('produces exactly the frames a synchronous build produces', () => {
    for (const [family, algorithm, params] of CASES) {
      const sync = framesOf(algorithm.build(params));
      const { result, chunks } = drainInChunks(algorithm, params);
      const chunked = framesOf(result);

      expect(chunks, `${family}: really was drained in slices`).toBeGreaterThan(1);
      expect(chunked.length, `${family}: frame count`).toBe(sync.length);
      expect(chunked, `${family}: frames`).toEqual(sync);
    }
  });

  it('is identical for a large run too, where the slicing actually bites', () => {
    const params = { g: '0-1:4,0-2:1,2-1:2,1-3:1,2-3:5,3-4:3,2-4:8,4-5:2,3-5:6,5-6:1,6-7:2,7-8:3,8-9:1,9-0:7' };
    const sync = framesOf(dijkstra.build(params));
    const { result, chunks } = drainInChunks(dijkstra, params);
    expect(chunks).toBeGreaterThan(2);
    expect(framesOf(result)).toEqual(sync);
  });

  it('reports a drained count that only grows and ends at the frame count', () => {
    const build = quicksort.startBuild({});
    const seen: number[] = [];
    for (let guard = 0; guard < 200000; guard++) {
      const step = build.step(0);
      seen.push(step.drained);
      if (step.done && step.result !== null) {
        expect(step.drained).toBe(framesOf(step.result).length);
        break;
      }
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i] ?? 0, `slice ${i}`).toBeGreaterThanOrEqual(seen[i - 1] ?? 0);
    }
  });

  it('settles a parse failure the same way both ways', () => {
    const params = { input: 'not numbers at all' };
    const sync = quicksort.build(params);
    const { result } = drainInChunks(quicksort, params);
    expect(sync.ok).toBe(false);
    expect(result).toEqual(sync);
  });

  it('keeps returning the settled result once finished', () => {
    const build = avl.startBuild({});
    const first = drainStep(build);
    const second = build.step(Number.POSITIVE_INFINITY);
    expect(second.done).toBe(true);
    expect(second.result).toBe(first);
  });
});

function drainStep(build: { step: (budgetMs: number) => { done: boolean; result: BuildResult | null } }): BuildResult {
  const step = build.step(Number.POSITIVE_INFINITY);
  if (step.result === null) throw new Error('expected the build to finish');
  return step.result;
}
