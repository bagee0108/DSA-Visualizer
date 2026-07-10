/** How long one frame stays on screen. */

import type { Frame } from '../core/types';

export const MIN_DWELL_MS = 400;
export const MAX_DWELL_MS = 2200;
export const BASE_DWELL_MS = 250;
export const MS_PER_WORD = 90;

const wordCounts = new WeakMap<Frame, number>();

export function explanationWordCount(frame: Frame): number {
  const cached = wordCounts.get(frame);
  if (cached !== undefined) return cached;

  const count = frame.explanation.trim().split(/\s+/).filter((word) => word.length > 0).length;
  wordCounts.set(frame, count);
  return count;
}

export function frameDwellMs(frame: Frame | undefined, speed: number): number {
  const safeSpeed = speed > 0 ? speed : 1;
  if (frame === undefined) return MIN_DWELL_MS / safeSpeed;

  const raw = BASE_DWELL_MS + explanationWordCount(frame) * MS_PER_WORD;
  const clamped = raw < MIN_DWELL_MS ? MIN_DWELL_MS : raw > MAX_DWELL_MS ? MAX_DWELL_MS : raw;
  return clamped / safeSpeed;
}
