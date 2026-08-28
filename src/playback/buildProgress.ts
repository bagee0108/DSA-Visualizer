/**
 * How far along a build is.
 *
 * A generator does not know how many frames it will yield, and asking it would
 * mean changing every generator, so the denominator is an estimate: the frame
 * count the last completed build of this algorithm at this input size
 * produced. The fraction is monotone either way - it rises towards the
 * estimate and then approaches 1 asymptotically instead of stalling or
 * jumping backwards when the estimate turns out to be low.
 */

/** Denominator before this algorithm and size have ever been built. */
const FIRST_GUESS = 1200;
/** Work always assumed to remain, as a fraction of the estimate. */
const TAIL = 0.08;
const CEILING = 0.99;

const counts = new Map<string, number>();

export function progressKey(id: string, size: number): string {
  return `${id}:${size}`;
}

export function rememberFrameCount(key: string, count: number): void {
  counts.set(key, count);
}

export function fractionFor(key: string, drained: number): number {
  const estimate = Math.max(1, counts.get(key) ?? FIRST_GUESS);
  const remaining = Math.max(estimate - drained, estimate * TAIL);
  return Math.min(CEILING, drained / (drained + remaining));
}
