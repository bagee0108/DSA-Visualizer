/**
 * Builds a run without blocking the frame. The generator is drained a slice at
 * a time, and a build superseded by new params is abandoned: its token is
 * dropped, so it can never deliver frames into the run that replaced it.
 */

import { useEffect, useState } from 'react';

import type { ParamMap, RegisteredAlgorithm } from '../core/define';
import type { Frame } from '../core/types';
import { fractionFor, progressKey, rememberFrameCount } from './buildProgress';
import { runChunked } from './buildRunner';

const NO_FRAMES: readonly Frame[] = [];

export interface ChunkedBuild {
  readonly frames: readonly Frame[];
  readonly error: string | null;
  readonly building: boolean;
  readonly progress: number;
}

const PENDING: ChunkedBuild = { frames: NO_FRAMES, error: null, building: true, progress: 0 };

export function useChunkedBuild(algorithm: RegisteredAlgorithm, params: ParamMap): ChunkedBuild {
  const [state, setState] = useState<ChunkedBuild>(PENDING);

  useEffect(() => {
    const key = progressKey(algorithm.meta.id, algorithm.sizeOf(params));
    setState(PENDING);

    const runner = runChunked(algorithm.startBuild(params), {
      onProgress: (drained) => {
        const progress = fractionFor(key, drained);
        setState((current) => (current.building ? { ...current, progress } : current));
      },
      onDone: (result) => {
        if (result.ok) rememberFrameCount(key, result.frames.length);
        setState({
          frames: result.ok ? result.frames : NO_FRAMES,
          error: result.ok ? null : result.error,
          building: false,
          progress: 1,
        });
      },
    });

    return () => runner.cancel();
  }, [algorithm, params]);

  return state;
}
