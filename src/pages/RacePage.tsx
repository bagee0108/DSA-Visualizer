/**
 * Race mode, the last level: two sorts on one input, on one timeline that
 * counts operations (comparisons plus array writes) rather than frames. See
 * CONTRIBUTING "Race mode" and src/race/race.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { Button, Chip, ChipGroup, IconButton } from '../components/ui';
import type { ParamMap, RegisteredAlgorithm } from '../core/define';
import { makeRng, randomSeed } from '../core/random';
import type { Frame } from '../core/types';
import { usePageMeta } from '../hooks/usePageMeta';
import { MAX_SPEED, MIN_SPEED } from '../playback/PlaybackProvider';
import { useChunkedBuild } from '../playback/useChunkedBuild';
import {
  frameIndexAt,
  LESSON_PRESET,
  MAX_RACE_ELEMENTS,
  MIN_RACE_ELEMENTS,
  nextEvent,
  OPS_PER_SECOND,
  opsOf,
  parseRace,
  previousEvent,
  RACE_DEFAULTS,
  RACE_ID,
  RACE_PRESETS,
  RACERS,
  raceTotal,
  sideParams,
  trackOf,
  type Track,
} from '../race/race';
import { ArrayRenderer } from '../renderers/ArrayRenderer';
import { useInk } from '../renderers/ink';
import { useRouter } from '../router/router';
import { LevelHeader, paramsToSearch, searchToParams } from './VisualizePage';

const SPEED_MARKS = [0.25, 0.5, 1, 2, 4, 8, 16] as const;
const FIELD_CLASS =
  'rounded-sm border border-edge bg-ground px-2 py-1 font-mono text-meta text-fg outline-none placeholder:text-fg-mute focus:border-focus';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function RacePage(): ReactNode {
  usePageMeta('Race mode - Treewidth');
  const { search, navigate } = useRouter();
  const params = useMemo(() => searchToParams(search), [search]);
  const merged = useMemo<ParamMap>(() => ({ ...RACE_DEFAULTS, ...params }), [params]);
  const parsed = useMemo(() => parseRace(params), [params]);

  const apply = useCallback((next: ParamMap) => navigate(`/visualize/${RACE_ID}${paramsToSearch({ ...merged, ...next }, RACE_DEFAULTS)}`), [merged, navigate]);

  const header = (
    <LevelHeader
      id={RACE_ID}
      name="Race mode"
      blurb="Two sorts on one input, on a clock that counts their operations."
      folder="advanced"
      what="input"
      shareable
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto min-[900px]:overflow-hidden">
      {header}
      <Setup merged={merged} apply={apply} />
      {parsed.ok ? (
        <Race left={parsed.value.left} right={parsed.value.right} values={parsed.value.values} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-10 text-center">
          <p className="text-meta font-medium text-danger">Could not start this race</p>
          <p className="max-w-md text-meta text-fg-dim">{parsed.error}</p>
        </div>
      )}
    </div>
  );
}

/* ---------------- setup: who races, on what ---------------- */

function Setup({ merged, apply }: { merged: ParamMap; apply: (next: ParamMap) => void }): ReactNode {
  const count = (merged.input ?? '').split(/[\s,;]+/).filter((token) => token.length > 0).length;
  const [size, setSize] = useState(() => Math.min(MAX_RACE_ELEMENTS, Math.max(MIN_RACE_ELEMENTS, count || 40)));
  const [draft, setDraft] = useState(merged.input ?? '');
  useEffect(() => setDraft(merged.input ?? ''), [merged.input]);

  const preset = (id: string): void => {
    const spec = RACE_PRESETS.find((candidate) => candidate.id === id);
    if (spec === undefined) return;
    apply({ input: spec.build(size, makeRng(randomSeed())).input ?? '' });
  };
  const lesson = (): void => {
    const sorted = RACE_PRESETS.find((candidate) => candidate.id === LESSON_PRESET.input);
    apply({ a: LESSON_PRESET.a, b: LESSON_PRESET.b, input: sorted?.build(size, makeRng(0)).input ?? '' });
  };
  const progress = ((size - MIN_RACE_ELEMENTS) / (MAX_RACE_ELEMENTS - MIN_RACE_ELEMENTS)) * 100;

  const picker = (key: 'a' | 'b', label: string): ReactNode => (
    <label className="flex items-center gap-1.5 text-micro text-fg-dim">
      {label}
      <select value={merged[key]} onChange={(event) => apply({ [key]: event.target.value })} className={FIELD_CLASS}>
        {RACERS.map((algorithm) => (
          <option key={algorithm.meta.id} value={algorithm.meta.id}>
            {algorithm.meta.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section aria-label="Race setup" className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-panel px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        {picker('a', 'Left')}
        <span className="font-mono text-micro text-fg-mute" aria-hidden="true">vs</span>
        {picker('b', 'Right')}
      </div>
      <ChipGroup label="Input">
        {RACE_PRESETS.map((spec) => (
          <Chip key={spec.id} onClick={() => preset(spec.id)}>
            {spec.label}
          </Chip>
        ))}
      </ChipGroup>
      <div className="flex items-center gap-2">
        <span className="font-mono text-micro text-fg-mute">n</span>
        <input
          type="range"
          min={MIN_RACE_ELEMENTS}
          max={MAX_RACE_ELEMENTS}
          value={size}
          onChange={(event) => setSize(Number(event.target.value))}
          className="viz-range w-28"
          style={{ '--viz-range-progress': `${progress}%` } as CSSProperties}
          aria-label="Generated input size"
        />
        <span className="w-7 font-mono text-micro tabular-nums text-fg">{size}</span>
      </div>
      <Chip onClick={lesson} title="Quicksort, pivoting on the last element, against insertion sort, on sorted input">
        {LESSON_PRESET.label}
      </Chip>
      <form
        className="flex min-w-[14rem] flex-1 items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          apply({ input: draft });
        }}
      >
        <label htmlFor="race-input" className="sr-only">
          Input values, up to {MAX_RACE_ELEMENTS}
        </label>
        <input id="race-input" value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false} className={`${FIELD_CLASS} min-w-0 flex-1`} placeholder="5, 3, 8, 1" />
        <Button size="sm" type="submit" disabled={draft === merged.input}>
          Race this
        </Button>
      </form>
    </section>
  );
}

/* ---------------- the race ---------------- */

function useTrack(algorithm: RegisteredAlgorithm, values: readonly number[]): { readonly track: Track | null; readonly error: string | null; readonly progress: number } {
  const params = useMemo(() => sideParams(algorithm, values), [algorithm, values]);
  const { frames, error, building, progress } = useChunkedBuild(algorithm, params);
  const track = useMemo(() => (building || frames.length === 0 ? null : trackOf(frames)), [building, frames]);
  return { track, error, progress };
}

function Race({ left, right, values }: { left: RegisteredAlgorithm; right: RegisteredAlgorithm; values: readonly number[] }): ReactNode {
  const a = useTrack(left, values);
  const b = useTrack(right, values);
  const tracks = useMemo(() => (a.track === null || b.track === null ? null : [a.track, b.track]), [a.track, b.track]);
  const total = tracks === null ? 0 : raceTotal(tracks);

  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [jumped, setJumped] = useState(true);
  const clockRef = useRef(0);
  const moveTo = useCallback((next: number, jump: boolean) => {
    const clamped = Math.max(0, Math.min(total, next));
    clockRef.current = clamped;
    setClock(clamped);
    setJumped(jump);
  }, [total]);

  // A new race starts at the beginning, stopped.
  useEffect(() => {
    clockRef.current = 0;
    setClock(0);
    setPlaying(false);
    setJumped(true);
  }, [tracks]);

  // The clock: operations per second times speed, on animation frames; it stops at the end.
  useEffect(() => {
    if (!playing || tracks === null) return;
    let raf = 0;
    let previous = performance.now();
    const tick = (now: number): void => {
      const next = Math.min(total, clockRef.current + ((now - previous) / 1000) * OPS_PER_SECOND * speed);
      previous = now;
      clockRef.current = next;
      setClock(next);
      setJumped(true);
      if (next >= total) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, total, tracks]);

  const play = useCallback(() => {
    if (tracks === null) return;
    if (clockRef.current >= total) moveTo(0, true);
    setPlaying(true);
  }, [moveTo, total, tracks]);
  const pause = useCallback(() => setPlaying(false), []);
  const stepForward = useCallback(() => {
    if (tracks === null) return;
    setPlaying(false);
    const next = nextEvent(tracks, Math.floor(clockRef.current));
    if (next !== null) moveTo(next, false);
  }, [moveTo, tracks]);
  const stepBack = useCallback(() => {
    if (tracks === null) return;
    setPlaying(false);
    moveTo(previousEvent(tracks, Math.ceil(clockRef.current)), false);
  }, [moveTo, tracks]);
  const reset = useCallback(() => {
    setPlaying(false);
    moveTo(0, true);
  }, [moveTo]);
  const toEnd = useCallback(() => {
    setPlaying(false);
    moveTo(total, true);
  }, [moveTo, total]);
  const changeSpeed = useCallback((next: number) => setSpeed(Math.min(MAX_SPEED, Math.max(MIN_SPEED, next))), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented || isEditableTarget(event.target)) return;
      const actions: Record<string, () => void> = {
        ' ': () => (playing ? pause() : play()),
        ArrowRight: stepForward,
        ArrowLeft: stepBack,
        ArrowUp: () => changeSpeed(speed * 2),
        ArrowDown: () => changeSpeed(speed / 2),
        Home: reset,
        End: toEnd,
        r: reset,
        R: reset,
      };
      const action = actions[event.key];
      if (action === undefined) return;
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [changeSpeed, pause, play, playing, reset, speed, stepBack, stepForward, toEnd]);

  // Said when the reader lands somewhere (a step, a scrub, a stop), never while it runs.
  const region = useRef<HTMLParagraphElement | null>(null);
  const whole = Math.floor(clock);
  useEffect(() => {
    if (playing || tracks === null || region.current === null) return;
    const [first, second] = tracks;
    if (first === undefined || second === undefined) return;
    const side = (name: string, track: Track): string => (whole >= track.total ? `${name} done in ${track.total.toLocaleString()} operations.` : `${name}: ${track.frames[frameIndexAt(track, whole)]?.explanation ?? ''}`);
    region.current.textContent = `Operation ${whole.toLocaleString()} of ${total.toLocaleString()}. ${side(left.meta.name, first)} ${side(right.meta.name, second)}`;
  }, [whole, playing, tracks, total, left.meta.name, right.meta.name]);

  const building = tracks === null;
  const error = a.error ?? b.error;

  return (
    <>
      <div className="grid shrink-0 grid-cols-1 min-[900px]:min-h-0 min-[900px]:flex-1 min-[900px]:shrink min-[900px]:grid-cols-2">
        <Lane algorithm={left} track={a.track} progress={a.progress} clock={whole} animate={!jumped} />
        <Lane algorithm={right} track={b.track} progress={b.progress} clock={whole} animate={!jumped} divided />
      </div>
      <p ref={region} className="sr-only" aria-live="polite" aria-atomic="true" />
      {error !== null && <p className="shrink-0 border-t border-line px-3 py-1 text-meta text-danger">{error}</p>}
      <Timeline
        clock={clock}
        total={total}
        disabled={building}
        playing={playing}
        speed={speed}
        onSeek={(next) => {
          setPlaying(false);
          moveTo(next, true);
        }}
        onPlay={playing ? pause : play}
        onStepBack={stepBack}
        onStepForward={stepForward}
        onReset={reset}
        onEnd={toEnd}
        onSpeed={changeSpeed}
      />
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }): ReactNode {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-micro text-fg-mute">{label}</span>
      <span className="font-mono text-meta tabular-nums text-fg">{value.toLocaleString()}</span>
    </div>
  );
}

function Lane({ algorithm, track, progress, clock, animate, divided = false }: {
  algorithm: RegisteredAlgorithm;
  track: Track | null;
  progress: number;
  clock: number;
  animate: boolean;
  divided?: boolean;
}): ReactNode {
  const ink = useInk();
  const frame: Frame | undefined = track === null ? undefined : track.frames[frameIndexAt(track, clock)];
  const done = track !== null && clock >= track.total;
  const ops = frame === undefined ? 0 : opsOf(frame);

  return (
    <section
      aria-label={`${algorithm.meta.name} lane`}
      className={`flex min-h-[300px] flex-col border-line min-[900px]:min-h-0 ${divided ? 'border-t min-[900px]:border-t-0 min-[900px]:border-l' : ''}`}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-panel px-3 py-1.5">
        <h2 className="font-display text-ui font-semibold font-stretch-semi-condensed text-fg">{algorithm.meta.name}</h2>
        <Stat label="comparisons" value={frame?.counters.comparisons ?? 0} />
        <Stat label="writes" value={frame?.counters.writes ?? 0} />
        <Stat label="ops" value={ops} />
        {done && track !== null && (
          <span className="ml-auto rounded-xs border border-accent-line bg-accent-wash px-1.5 py-0.5 font-mono text-micro text-fg">
            done · {track.total.toLocaleString()} ops
          </span>
        )}
      </header>
      <div className="min-h-0 flex-1 bg-ground p-1">
        {frame === undefined || frame.structure.kind !== 'array' ? (
          <div className="flex h-full items-center justify-center font-mono text-micro text-fg-mute">building {Math.round(progress * 100)}%</div>
        ) : (
          <ArrayRenderer snapshot={frame.structure} ink={ink} highlights={frame.highlights} pointers={frame.pointers} animate={animate} durationMs={200} />
        )}
      </div>
      <p className="min-h-10 shrink-0 border-t border-line bg-panel px-3 py-1.5 text-meta text-fg-dim">{frame?.explanation ?? ''}</p>
    </section>
  );
}

/* ---------------- the shared timeline ---------------- */

const SHAPE = {
  play: 'M 6 4.2 L 16 10 L 6 15.8 Z',
  pause: 'M 5.8 4.4 H 9 V 15.6 H 5.8 Z M 11.6 4.4 H 14.8 V 15.6 H 11.6 Z',
  back: 'M15 4.5v11l-8-5.5 8-5.5z M4 4.5h2.4v11H4z',
  forward: 'M5 4.5v11l8-5.5-8-5.5z M13.6 4.5H16v11h-2.4z',
  end: 'M5 4.5v11l7-5.5-7-5.5z M12 4.5v11l3-5.5-3-5.5z',
};

function Icon({ d }: { d: string }): ReactNode {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Timeline({ clock, total, disabled, playing, speed, onSeek, onPlay, onStepBack, onStepForward, onReset, onEnd, onSpeed }: {
  clock: number;
  total: number;
  disabled: boolean;
  playing: boolean;
  speed: number;
  onSeek: (clock: number) => void;
  onPlay: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onReset: () => void;
  onEnd: () => void;
  onSpeed: (speed: number) => void;
}): ReactNode {
  const whole = Math.floor(clock);
  const progress = total === 0 ? 0 : (clock / total) * 100;
  return (
    <section aria-label="Race timeline" className="sticky bottom-0 z-10 flex shrink-0 flex-col gap-1.5 border-t border-line bg-panel px-3 py-2">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={Math.max(1, total)}
          value={whole}
          disabled={disabled}
          onChange={(event) => onSeek(Number(event.target.value))}
          className="viz-range flex-1"
          style={{ '--viz-range-progress': `${progress}%` } as CSSProperties}
          aria-label="Operations done"
          aria-valuetext={`Operation ${whole.toLocaleString()} of ${total.toLocaleString()}`}
        />
        <span className="shrink-0 font-mono text-micro tabular-nums text-fg-dim">
          {whole.toLocaleString()} / {total.toLocaleString()} ops
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <IconButton label="Reset" title="Reset (R)" onClick={onReset} disabled={disabled || whole === 0}>
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M10 4.6a5.4 5.4 0 1 0 5.2 6.8" />
          </svg>
        </IconButton>
        <IconButton label="Step back" title="Step back to the previous operation (left arrow)" onClick={onStepBack} disabled={disabled || whole === 0}>
          <Icon d={SHAPE.back} />
        </IconButton>
        <IconButton label={playing ? 'Pause' : 'Play'} title={`${playing ? 'Pause' : 'Play'} (space)`} variant="primary" onClick={onPlay} disabled={disabled}>
          <Icon d={playing ? SHAPE.pause : SHAPE.play} />
        </IconButton>
        <IconButton label="Step forward" title="Step to the next operation (right arrow)" onClick={onStepForward} disabled={disabled || whole >= total}>
          <Icon d={SHAPE.forward} />
        </IconButton>
        <IconButton label="Jump to end" title="Jump to end (End)" onClick={onEnd} disabled={disabled || whole >= total}>
          <Icon d={SHAPE.end} />
        </IconButton>
        <div className="mx-2 h-5 w-px bg-line" aria-hidden="true" />
        <ChipGroup label="Speed">
          {SPEED_MARKS.map((mark) => (
            <Chip key={mark} pressed={speed === mark} onClick={() => onSpeed(mark)}>
              {mark}x
            </Chip>
          ))}
        </ChipGroup>
        <span className="ml-auto font-mono text-micro text-fg-mute">{(OPS_PER_SECOND * speed).toLocaleString()} ops per second</span>
      </div>
    </section>
  );
}

