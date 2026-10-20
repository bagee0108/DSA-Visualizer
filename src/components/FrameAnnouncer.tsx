import { useEffect, useRef, type ReactNode } from 'react';

import { createAnnouncer } from '../playback/announce';
import { usePlayback } from '../playback/PlaybackProvider';

/**
 * A visually hidden live region for screen readers. It speaks the frame the
 * reader landed on, never the frames playback runs through; see announce.ts.
 *
 * The text is written straight into the region rather than through state: a
 * state update from an effect on every step is a second render per step, and
 * a held arrow key (or a fast keyboard) stacks those past React's limit on
 * nested updates, which throws.
 */
export function FrameAnnouncer(): ReactNode {
  const { frame, index, count, playing } = usePlayback();
  const announce = useRef(createAnnouncer());
  const region = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const next = announce.current({ frame, index, count, playing });
    if (next !== null && region.current !== null) region.current.textContent = next;
  }, [frame, index, count, playing]);

  return <p ref={region} className="sr-only" aria-live="polite" aria-atomic="true" />;
}
