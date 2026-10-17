/**
 * What the screen-reader live region says, and when. Playback can change the
 * frame hundreds of times a second, so the region is only written when the
 * reader asked for a frame: a step, a scrub, a jump, the end, or playback
 * stopping. While playing it stays silent.
 */

import type { Frame } from '../core/types';

export interface AnnounceView {
  readonly frame: Frame | null;
  readonly index: number;
  readonly count: number;
  readonly playing: boolean;
}

/** The text to write into the live region, or null to leave it alone. */
export function announcement(previous: AnnounceView | null, next: AnnounceView): string | null {
  if (previous === null || next.playing || next.frame === null) return null;
  const stopped = previous.playing;
  const moved = next.frame !== previous.frame;
  if (!stopped && !moved) return null;
  return `Frame ${next.index + 1} of ${next.count}. ${next.frame.explanation}`;
}

/** Remembers the last view, so each render can ask "write now?" with one call. */
export function createAnnouncer(): (view: AnnounceView) => string | null {
  let previous: AnnounceView | null = null;
  return (view) => {
    const text = announcement(previous, view);
    previous = view;
    return text;
  };
}
