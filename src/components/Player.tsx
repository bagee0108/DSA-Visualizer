/** The transport bar. */

import type { ReactNode } from 'react';

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
    'inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-35 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500';
  const tone = primary
    ? 'h-10 w-10 bg-indigo-600 text-white hover:bg-indigo-500'
    : 'h-9 w-9 bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700';

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

const SPEED_MARKS = [0.25, 0.5, 1, 2, 4] as const;

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

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={lastIndex}
          step={1}
          value={index}
          onChange={(event) => seek(Number(event.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 dark:bg-slate-800"
          style={{
            background: `linear-gradient(to right, #6366f1 ${progress}%, transparent ${progress}%)`,
          }}
          aria-label="Scrub through frames"
        />
        <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
          {(index + 1).toLocaleString()} / {count.toLocaleString()}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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

        <div className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-800" />

        <div className="flex min-w-[190px] flex-1 items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">Speed</span>
          <input
            type="range"
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={0.25}
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 dark:bg-slate-800"
            aria-label="Playback speed"
          />
          <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
            {speed.toFixed(2)}x
          </span>
        </div>

        <div className="hidden items-center gap-1 lg:flex">
          {SPEED_MARKS.map((mark) => (
            <button
              key={mark}
              type="button"
              onClick={() => setSpeed(mark)}
              className={`rounded px-1.5 py-0.5 font-mono text-[11px] transition-colors ${
                Math.abs(speed - mark) < 0.01
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800'
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
