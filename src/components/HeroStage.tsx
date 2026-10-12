/**
 * The home hero's stage: a real run, drawn by the real renderer, on a loop.
 * It is the one place a canvas plays without being asked to, and it earns
 * that by being the product rather than a picture of it: every frame,
 * movement and caption is exactly what the AVL screen shows for this input.
 *
 * It pauses while off-screen and on request, and under reduced motion it
 * does not loop at all: it shows the rotation as a still.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { getAlgorithm } from '../core/registry';
import type { Frame } from '../core/types';
import { usePrefersReducedMotion } from '../hooks/useMotion';
import { frameDwellMs } from '../playback/dwell';
import { StructureCanvas } from '../renderers';
import { ButtonLink, IconButton } from './ui';

/** 30 then 10, then 20 lands between them: a left-right double rotation. */
const RUN = { id: 'avl', input: '30, 10', ops: 'insert 20' } as const;
const RUN_HREF = `/visualize/${RUN.id}?input=30,10&ops=insert+20`;
const SPEED = 2;
/** How long the finished tree holds before the run starts over. */
const HOLD_LAST_MS = 2600;

function buildRun(): readonly Frame[] {
  const algorithm = getAlgorithm(RUN.id);
  if (algorithm === undefined) return [];
  const result = algorithm.build({ ...algorithm.defaults, input: RUN.input, ops: RUN.ops, seed: '1' });
  return result.ok ? result.frames : [];
}

/** For the still: the frame where the run explains why it must rotate. */
function stillIndex(frames: readonly Frame[]): number {
  const at = frames.findIndex((frame) => /\brotat/i.test(frame.explanation) && !/^Done/.test(frame.explanation));
  return at === -1 ? Math.max(0, frames.length - 1) : at;
}

export function HeroStage(): ReactNode {
  const frames = useMemo(buildRun, []);
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [jumped, setJumped] = useState(true);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const box = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = box.current;
    if (node === null) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? true), {
      threshold: 0.2,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const playing = !reduced && !paused && visible && frames.length > 1;
  const shown = reduced ? stillIndex(frames) : index;
  const frame = frames[shown];
  const dwell = frameDwellMs(frame, SPEED);

  // One timer per frame, on requestAnimationFrame. A hidden tab stops
  // delivering frames, so the loop also stops there for free.
  useEffect(() => {
    if (!playing) return;
    const last = index >= frames.length - 1;
    const wait = last ? HOLD_LAST_MS : dwell;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number): void => {
      if (now - start < wait) {
        raf = requestAnimationFrame(tick);
        return;
      }
      setJumped(last);
      setIndex(last ? 0 : index + 1);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, index, dwell, frames.length]);

  if (frame === undefined) return null;

  return (
    <figure
      ref={box}
      className="m-0 flex min-w-0 flex-col overflow-hidden rounded-sm border border-line bg-ground"
      aria-label="A real AVL tree run on a loop: 30 and 10 are inserted, then 20, which forces a double rotation."
    >
      <div className="flex items-center justify-between gap-3 border-b border-line bg-panel px-3 py-1.5">
        <span className="font-mono text-micro text-fg-mute">~/trees/avl-tree</span>
        <span className="flex items-center gap-3">
          <span className="font-mono text-micro tabular-nums text-fg-mute" aria-hidden="true">
            frame {shown + 1} / {frames.length}
          </span>
          {!reduced && (
            <IconButton
              size="sm"
              label={paused ? 'Resume the run' : 'Pause the run'}
              onClick={() => setPaused((was) => !was)}
            >
              <svg viewBox="0 0 20 20" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                {paused ? <path d="M6 4.5v11l9-5.5-9-5.5z" /> : <path d="M5.5 4.5h3v11h-3zM11.5 4.5h3v11h-3z" />}
              </svg>
            </IconButton>
          )}
          <ButtonLink to={RUN_HREF} variant="ghost" size="sm">
            Open this run
          </ButtonLink>
        </span>
      </div>
      <div className="h-[22rem] p-1" aria-hidden="true">
        <StructureCanvas frame={frame} frames={frames} animate={!jumped && !reduced} durationMs={dwell} />
      </div>
      <figcaption className="min-h-14 border-t border-line px-3 py-2 text-ui text-fg-dim" aria-hidden="true">
        {frame.explanation}
      </figcaption>
    </figure>
  );
}
