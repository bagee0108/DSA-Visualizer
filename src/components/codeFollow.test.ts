import { describe, expect, it } from 'vitest';

import { followScrollTop, READER_HOLD_MS, type FollowInput } from './codeFollow';

const VIEW = { lineHeight: 16, viewTop: 0, viewHeight: 192 } as const;

function at(activeLine: number, now: number, readerScrolledAt: number | null, viewTop = 0): number | null {
  const input: FollowInput = { ...VIEW, viewTop, activeLine, now, readerScrolledAt };
  return followScrollTop(input);
}

describe('code panel follow', () => {
  it('follows from page load: the first frames scroll to a line below the fold', () => {
    // performance.now() is small right after load; nothing the reader did should hold the panel.
    for (const now of [0, 16, 200, READER_HOLD_MS - 1]) expect(at(30, now, null), `at ${now} ms`).not.toBeNull();
    expect(at(30, 50, null)).toBe(29 * 16 - 96 + 8);
  });

  it('holds still for a while after a scroll the reader started, then follows again', () => {
    expect(at(30, 5000, 4000)).toBeNull();
    expect(at(30, 4000 + READER_HOLD_MS, 4000)).not.toBeNull();
  });

  it('stays put when the line is already comfortably in view, or there is no line', () => {
    expect(at(5, 50, null)).toBeNull();
    expect(at(0, 50, null)).toBeNull();
    expect(at(1, 50, null, 160)).toBe(0);
  });
});
