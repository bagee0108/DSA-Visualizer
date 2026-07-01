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

export const BASE_FRAME_MS = 140;
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;

export interface PlaybackValue {
  readonly frames: readonly Frame[];
  readonly frame: Frame | null;
  readonly index: number;
  readonly count: number;
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
  readonly setSpeed: (speed: number) => void;
}

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
  readonly children: ReactNode;
}

export function PlaybackProvider({ frames, children }: PlaybackProviderProps): ReactNode {
  const [index, setIndexState] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [jumped, setJumped] = useState(false);

  const indexRef = useRef(0);
  const lastIndex = Math.max(0, frames.length - 1);

  useEffect(() => {
    indexRef.current = 0;
    setIndexState(0);
    setPlaying(false);
    setJumped(true);
  }, [frames]);

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
    setPlaying(true);
  }, [frames.length, moveTo]);

  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => (playing ? pause() : play()), [pause, play, playing]);
  const stepForward = useCallback(() => {
    setPlaying(false);
    moveTo(indexRef.current + 1, false);
  }, [moveTo]);
  const stepBack = useCallback(() => {
    setPlaying(false);
    moveTo(indexRef.current - 1, false);
  }, [moveTo]);
  const seek = useCallback((next: number) => {
    setPlaying(false);
    moveTo(next, true);
  }, [moveTo]);
  const reset = useCallback(() => {
    setPlaying(false);
    moveTo(0, true);
  }, [moveTo]);
  const toEnd = useCallback(() => {
    setPlaying(false);
    moveTo(frames.length - 1, true);
  }, [frames.length, moveTo]);
  const setSpeed = useCallback((next: number) => {
    setSpeedState(clamp(next, MIN_SPEED, MAX_SPEED));
  }, []);

  useEffect(() => {
    if (!playing || frames.length === 0) return;

    let rafId = 0;
    let previous = performance.now();
    let accumulated = 0;
    const durationMs = BASE_FRAME_MS / speed;

    const tick = (now: number): void => {
      accumulated += now - previous;
      previous = now;

      let advance = 0;
      while (accumulated >= durationMs && advance < 512) {
        accumulated -= durationMs;
        advance += 1;
      }

      if (advance > 0) {
        const next = Math.min(indexRef.current + advance, frames.length - 1);
        indexRef.current = next;
        setIndexState(next);
        setJumped(advance > 1);
        if (next >= frames.length - 1) {
          setPlaying(false);
          return;
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing, speed, frames.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isEditableTarget(event.target)) return;

      switch (event.key) {
        case ' ':
        case 'Spacebar':
          event.preventDefault();
          toggle();
          break;
        case 'ArrowRight':
          event.preventDefault();
          stepForward();
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
  }, [reset, setSpeed, speed, stepBack, stepForward, toEnd, toggle]);

  const value = useMemo<PlaybackValue>(
    () => ({
      frames,
      frame: frames[index] ?? null,
      index,
      count: frames.length,
      playing,
      speed,
      atStart: index <= 0,
      atEnd: index >= lastIndex,
      jumped,
      frameDurationMs: BASE_FRAME_MS / speed,
      play,
      pause,
      toggle,
      stepForward,
      stepBack,
      seek,
      reset,
      toEnd,
      setSpeed,
    }),
    [
      frames,
      index,
      jumped,
      lastIndex,
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
