/** When the code panel follows the active line, and where to. Pure, so the timing rule is testable without a DOM. */

/** After a scroll the reader started, following waits this long before it takes over again. */
export const READER_HOLD_MS = 1500;

export interface FollowInput {
  /** 1-based; 0 or less means no active line. */
  readonly activeLine: number;
  readonly lineHeight: number;
  readonly viewTop: number;
  readonly viewHeight: number;
  readonly now: number;
  /** When the reader last scrolled the panel themselves; null until they ever do. */
  readonly readerScrolledAt: number | null;
}

/** The scrollTop to move to, or null to stay put. */
export function followScrollTop(input: FollowInput): number | null {
  const { activeLine, lineHeight, viewTop, viewHeight, now, readerScrolledAt } = input;
  if (activeLine <= 0) return null;
  // Only a scroll the reader started holds the panel; mounting and loading never do.
  if (readerScrolledAt !== null && now - readerScrolledAt < READER_HOLD_MS) return null;
  const top = (activeLine - 1) * lineHeight;
  const comfortablyInView = top >= viewTop + lineHeight && top + lineHeight <= viewTop + viewHeight - lineHeight;
  if (comfortablyInView) return null;
  return Math.max(0, top - viewHeight / 2 + lineHeight / 2);
}
