/**
 * The single owner of playback state. The clock is requestAnimationFrame with
 * a time accumulator. setInterval would drift against the display and keep
 * firing in a background tab.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { Frame } from '../core/types';
import { frameDwellMs } from './dwell';
import { phaseEndIndex } from './phaseJump';
import { INITIAL_STATE, step, withProgress, type Mode, type ModeEvent } from './mode';

export const MIN_SPEED = 0.25;
export const MAX_SPEED = 16;

export interface PlaybackValue {
  readonly frames: readonly Frame[];
  readonly frame: Frame | null;
  readonly index: number;
  readonly count: number;
  readonly mode: Mode;
  /** Fraction of the build drained; only meaningful while precomputing. */
  readonly progress: number;
  /** Derived: `mode === 'playing'`. */
  readonly playing: boolean;
  readonly speed: number;
  readonly atStart: boolean;
  readonly atEnd: boolean;
  readonly jumped: boolean;
  readonly frameDurationMs: number;
  readonly play: () => void;
  readonly pause: () => void;
  readonly toggle: () => void;
  readonly stepForward: () => void;
  readonly stepBack: () => void;
  readonly seek: (index: number) => void;
  readonly reset: () => void;
  readonly toEnd: () => void;
  /** What the level calls a phase ("pass"), when it offers jumping to a phase's end; null otherwise. */
  readonly phaseJump: string | null;
  /** To the last frame of this phase, or of the next one when already there. */
  readonly toPhaseEnd: () => void;
  readonly setSpeed: (speed: number) => void;
}

const NO_FRAMES: readonly Frame[] = [];

const PlaybackContext = createContext<PlaybackValue | null>(null);

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export interface PlaybackProviderProps {
  readonly frames: readonly Frame[];
  /** A build is in flight; frames are not final yet. */
  readonly building?: boolean;
  /** Fraction of that build drained so far. */
  readonly progress?: number;
  /** The structure is being edited: frames are discarded until it ends, and the run is built again. */
  readonly editing?: boolean;
  /** The level's name for a phase, when it offers jumping to a phase's end (Shift+Right). */
  readonly phaseJump?: string | null;
  readonly children: ReactNode;
}

export function PlaybackProvider({
  frames,
  building = false,
  progress = 0,
  editing = false,
  phaseJump = null,
  children,
}: PlaybackProviderProps): ReactNode {
  const [index, setIndexState] = useState(0);
  const [state, setState] = useState(INITIAL_STATE);
  const { mode } = state;
  const [speed, setSpeedState] = useState(1);
  const [jumped, setJumped] = useState(false);

  const indexRef = useRef(0);
  const lastIndex = Math.max(0, frames.length - 1);
  const playing = mode === 'playing';

  const send = useCallback((...events: readonly ModeEvent[]) => {
    setState((current) => events.reduce((carried, event) => step(carried, event), current));
  }, []);

  // A new frame array is a structural change: the cursor goes back to the top.
  useEffect(() => {
    indexRef.current = 0;
    setIndexState(0);
    setJumped(true);
  }, [frames]);

  // The build drives the machine. Every route walks the legal path, so a run
  // still only ever reaches `paused` through `precomputing`.
  useEffect(() => {
    setState((current) => {
      if (building) {
        if (current.mode === 'precomputing') return withProgress(current, progress);
        return step(step(current, 'invalidate'), 'precompute', progress);
      }
      if (frames.length === 0) return step(current, 'invalidate');
      if (current.mode === 'precomputing') return step(current, 'ready');
      return step(step(step(current, 'invalidate'), 'precompute'), 'ready');
    });
  }, [building, progress, frames]);

  // Editing goes through the machine: invalidate (so a build in flight is dropped too), then edit. Leaving
  // commits back to idle and precomputes again; a new build drives that itself, an unchanged run is ready at once.
  const editingRef = useRef(editing);
  const buildRef = useRef({ building, progress, frames });
  buildRef.current = { building, progress, frames };
  useEffect(() => {
    if (editingRef.current === editing) return;
    editingRef.current = editing;
    setState((current) => {
      if (editing) return step(step(current, 'invalidate'), 'edit');
      if (current.mode !== 'editing') return current;
      const left = step(current, 'commit');
      const build = buildRef.current;
      if (build.building) return step(left, 'precompute', build.progress);
      if (build.frames.length === 0) return left;
      return step(step(left, 'precompute'), 'ready');
    });
    indexRef.current = 0;
    setIndexState(0);
    setJumped(true);
  }, [editing]);

  const moveTo = useCallback(
    (next: number, viaJump: boolean) => {
      const clamped = clamp(next, 0, Math.max(0, frames.length - 1));
      indexRef.current = clamped;
      setIndexState(clamped);
      setJumped(viaJump);
    },
    [frames.length],
  );

  const play = useCallback(() => {
    if (frames.length === 0) return;
    if (indexRef.current >= frames.length - 1) moveTo(0, true);
    send('play');
  }, [frames.length, moveTo, send]);

  const pause = useCallback(() => send('pause'), [send]);
  const toggle = useCallback(() => (playing ? pause() : play()), [pause, play, playing]);
  const stepForward = useCallback(() => {
    send('pause');
    moveTo(indexRef.current + 1, false);
  }, [moveTo, send]);
  const stepBack = useCallback(() => {
    send('pause');
    moveTo(indexRef.current - 1, false);
  }, [moveTo, send]);
  const seek = useCallback((next: number) => {
    send('pause');
    moveTo(next, true);
  }, [moveTo, send]);
  const reset = useCallback(() => {
    send('pause');
    moveTo(0, true);
  }, [moveTo, send]);
  const toEnd = useCallback(() => {
    send('pause');
    moveTo(frames.length - 1, true);
  }, [frames.length, moveTo, send]);
  const toPhaseEnd = useCallback(() => {
    if (phaseJump === null) return;
    send('pause');
    moveTo(phaseEndIndex(frames, indexRef.current), true);
  }, [frames, moveTo, phaseJump, send]);
  const setSpeed = useCallback((next: number) => {
    setSpeedState(clamp(next, MIN_SPEED, MAX_SPEED));
  }, []);

  useEffect(() => {
    if (!playing || frames.length === 0) return;

    let rafId = 0;
    let previous = performance.now();
    let accumulated = 0;
    const lastFrameIndex = frames.length - 1;

    const tick = (now: number): void => {
      accumulated += now - previous;
      previous = now;

      let cursor = indexRef.current;
      let advance = 0;
      while (advance < 512 && cursor < lastFrameIndex) {
        const dwell = frameDwellMs(frames[cursor], speed);
        if (accumulated < dwell) break;
        accumulated -= dwell;
        cursor += 1;
        advance += 1;
      }

      if (advance > 0) {
        indexRef.current = cursor;
        setIndexState(cursor);
        setJumped(advance > 1);
        if (cursor >= lastFrameIndex) {
          send('end');
          return;
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing, speed, frames, send]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      // While the structure is being edited its keys belong to the editor.
      if (mode === 'editing') return;
      // A focused control that used the key (a splitter's arrows, Home and End) has the last word.
      if (event.defaultPrevented || isEditableTarget(event.target)) return;

      switch (event.key) {
        case ' ':
        case 'Spacebar':
          event.preventDefault();
          toggle();
          break;
        case 'ArrowRight':
          event.preventDefault();
          if (event.shiftKey && phaseJump !== null) toPhaseEnd();
          else stepForward();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          stepBack();
          break;
        case 'ArrowUp':
          event.preventDefault();
          setSpeed(speed * 2);
          break;
        case 'ArrowDown':
          event.preventDefault();
          setSpeed(speed / 2);
          break;
        case 'Home':
          event.preventDefault();
          reset();
          break;
        case 'End':
          event.preventDefault();
          toEnd();
          break;
        case 'r':
        case 'R':
          event.preventDefault();
          reset();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, phaseJump, reset, setSpeed, speed, stepBack, stepForward, toEnd, toPhaseEnd, toggle]);

  const value = useMemo<PlaybackValue>(
    () => ({
      frames: mode === 'editing' ? NO_FRAMES : frames,
      frame: mode === 'editing' ? null : (frames[index] ?? null),
      index,
      count: mode === 'editing' ? 0 : frames.length,
      mode,
      progress: state.progress,
      playing,
      speed,
      // Nothing to move through while the structure is edited.
      atStart: mode === 'editing' || index <= 0,
      atEnd: mode === 'editing' || index >= lastIndex,
      jumped,
      frameDurationMs: frameDwellMs(frames[index], speed),
      play,
      pause,
      toggle,
      stepForward,
      stepBack,
      seek,
      reset,
      toEnd,
      phaseJump,
      toPhaseEnd,
      setSpeed,
    }),
    [
      frames,
      index,
      jumped,
      lastIndex,
      mode,
      state.progress,
      pause,
      play,
      playing,
      reset,
      seek,
      setSpeed,
      speed,
      stepBack,
      stepForward,
      toEnd,
      phaseJump,
      toPhaseEnd,
      toggle,
    ],
  );

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

export function usePlayback(): PlaybackValue {
  const value = useContext(PlaybackContext);
  if (value === null) throw new Error('usePlayback must be used inside PlaybackProvider');
  return value;
}
