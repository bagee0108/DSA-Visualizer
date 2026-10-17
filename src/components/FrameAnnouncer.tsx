import { useEffect, useRef, useState, type ReactNode } from 'react';

import { createAnnouncer } from '../playback/announce';
import { usePlayback } from '../playback/PlaybackProvider';

/**
 * A visually hidden live region for screen readers. It speaks the frame the
 * reader landed on, never the frames playback runs through; see announce.ts.
 */
export function FrameAnnouncer(): ReactNode {
  const { frame, index, count, playing } = usePlayback();
  const announce = useRef(createAnnouncer());
  const [text, setText] = useState('');

  useEffect(() => {
    const next = announce.current({ frame, index, count, playing });
    if (next !== null) setText(next);
  }, [frame, index, count, playing]);

  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {text}
    </p>
  );
}
