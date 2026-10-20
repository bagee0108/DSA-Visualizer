/**
 * "Jump to the end of this pass": the last frame of the run of frames that
 * share the current frame's phase. From a phase's last frame it goes to the
 * end of the next one, so pressing it again walks the run phase by phase. A
 * level opts in with `meta.phaseJump`, the noun its phases are called.
 */

import type { Frame } from '../core/types';

export function phaseEndIndex(frames: readonly Frame[], index: number): number {
  const last = frames.length - 1;
  if (last < 0) return 0;
  let at = Math.max(0, Math.min(index, last));
  const runEnd = (from: number): number => {
    const phase = frames[from]?.phase;
    let end = from;
    while (end < last && frames[end + 1]?.phase === phase) end += 1;
    return end;
  };
  let end = runEnd(at);
  if (end === at && at < last) {
    at += 1;
    end = runEnd(at);
  }
  return end;
}
