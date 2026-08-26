/** The transport bar. */

import type { CSSProperties, ReactNode } from 'react';

import { MAX_SPEED, MIN_SPEED, usePlayback } from '../playback/PlaybackProvider';

function IconPlay(): ReactNode {
  return <path d="M6 4.5v11l9-5.5-9-5.5z" />;
}

function IconPause(): ReactNode {
  return (
    <>
      <rect x="5.5" y="4.5" width="3.2" height="11" rx="1" />
      <rect x="11.3" y="4.5" width="3.2" height="11" rx="1" />
    </>
  );
}

function IconStepForward(): ReactNode {
  return (
    <>
      <path d="M5 4.5v11l8-5.5-8-5.5z" />
      <rect x="13.6" y="4.5" width="2.4" height="11" rx="1" />
    </>
  );
}

function IconStepBack(): ReactNode {
  return (
    <>
      <path d="M15 4.5v11l-8-5.5 8-5.5z" />
      <rect x="4" y="4.5" width="2.4" height="11" rx="1" />
    </>
  );
}

function IconReset(): ReactNode {
  return (
    <path
      d="M10 4.6a5.4 5.4 0 1 0 5.2 6.8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  );
}

function IconEnd(): ReactNode {
  return (
    <>
      <path d="M5 4.5v11l7-5.5-7-5.5z" />
      <path d="M12 4.5v11l3-5.5-3-5.5z" />
    </>
  );
}

interface ControlButtonProps {
  readonly label: string;
  readonly shortcut?: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly primary?: boolean;
  readonly children: ReactNode;
}

function ControlButton({
  label,
  shortcut,
  onClick,
  disabled = false,
  primary = false,
  children,
}: ControlButtonProps): ReactNode {
  const base =
    'inline-flex items-center justify-center rounded-sm border transition-colors disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent';
  const tone = primary
    ? 'h-8 w-8 border-edge bg-raised text-fg hover:border-fg-mute'
    : 'h-8 w-8 border-transparent text-fg-dim hover:bg-raised hover:text-fg';

  return (
    <button
      type="button"
      className={`${base} ${tone}`}
      onClick={onClick}
      disabled={disabled}
      title={shortcut === undefined ? label : `${label} (${shortcut})`}
      aria-label={label}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

const SPEED_MARKS = [0.25, 0.5, 1, 2, 4, 8, 16] as const;

const SLIDER_STEPS = 600;
const SPEED_RATIO = MAX_SPEED / MIN_SPEED;

function speedToSlider(speed: number): number {
  return Math.round((Math.log(speed / MIN_SPEED) / Math.log(SPEED_RATIO)) * SLIDER_STEPS);
}

function sliderToSpeed(position: number): number {
  const raw = MIN_SPEED * SPEED_RATIO ** (position / SLIDER_STEPS);
  return Math.round(raw * 100) / 100;
}

function formatSpeed(speed: number): string {
  return speed >= 10 ? `${speed.toFixed(1)}x` : `${speed.toFixed(2)}x`;
}

/** Filled fraction of a range track; read by .viz-range in index.css. */
function fill(percent: number, colour?: string): CSSProperties {
  return { '--viz-range-progress': `${percent}%`, ...(colour === undefined ? {} : { '--viz-range-fill': colour }) } as CSSProperties;
}

export function Player(): ReactNode {
  const {
    index,
    count,
    playing,
    speed,
    atStart,
    atEnd,
    play,
    pause,
    stepBack,
    stepForward,
    seek,
    reset,
    toEnd,
    setSpeed,
  } = usePlayback();

  const lastIndex = Math.max(0, count - 1);
  const progress = lastIndex === 0 ? 0 : (index / lastIndex) * 100;
  const speedPosition = speedToSlider(speed);

  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-t border-line bg-panel px-3 py-2">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={lastIndex}
          step={1}
          value={index}
          onChange={(event) => seek(Number(event.target.value))}
          className="viz-range w-full"
          style={fill(progress)}
          aria-label="Scrub through frames"
        />
        <span className="shrink-0 font-mono text-micro tabular-nums text-fg-dim">
          {(index + 1).toLocaleString()} / {count.toLocaleString()}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <ControlButton label="Reset" shortcut="R" onClick={reset} disabled={atStart}>
          <IconReset />
        </ControlButton>
        <ControlButton label="Step back" shortcut="left arrow" onClick={stepBack} disabled={atStart}>
          <IconStepBack />
        </ControlButton>
        <ControlButton
          label={playing ? 'Pause' : 'Play'}
          shortcut="space"
          onClick={playing ? pause : play}
          primary
        >
          {playing ? <IconPause /> : <IconPlay />}
        </ControlButton>
        <ControlButton
          label="Step forward"
          shortcut="right arrow"
          onClick={stepForward}
          disabled={atEnd}
        >
          <IconStepForward />
        </ControlButton>
        <ControlButton label="Jump to end" shortcut="End" onClick={toEnd} disabled={atEnd}>
          <IconEnd />
        </ControlButton>

        <div className="mx-2 h-5 w-px bg-line" />

        <div className="flex min-w-48 flex-1 items-center gap-2">
          <span className="font-mono text-micro uppercase tracking-wider text-fg-mute">speed</span>
          <input
            type="range"
            min={0}
            max={SLIDER_STEPS}
            step={1}
            value={speedPosition}
            onChange={(event) => setSpeed(sliderToSpeed(Number(event.target.value)))}
            className="viz-range flex-1"
            style={fill((speedPosition / SLIDER_STEPS) * 100, 'var(--color-fg-mute)')}
            aria-label="Playback speed"
            aria-valuetext={formatSpeed(speed)}
          />
          <span className="w-12 shrink-0 font-mono text-micro tabular-nums text-fg">
            {formatSpeed(speed)}
          </span>
        </div>

        <div className="hidden items-center gap-0.5 lg:flex">
          {SPEED_MARKS.map((mark) => (
            <button
              key={mark}
              type="button"
              onClick={() => setSpeed(mark)}
              title={mark > 4 ? 'Visuals only - the explanation goes by too fast to read' : undefined}
              className={`rounded-xs border px-1.5 py-0.5 font-mono text-micro tabular-nums transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                Math.abs(speed - mark) < 0.01
                  ? 'border-edge bg-raised text-fg'
                  : 'border-transparent text-fg-mute hover:text-fg'
              }`}
            >
              {mark}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
