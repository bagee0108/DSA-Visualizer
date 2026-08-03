/**
 * One visualization screen: canvas, explanation, transport, code, call stack,
 * complexity readout and custom input.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { CallStackPanel } from '../components/CallStackPanel';
import { CodePanel } from '../components/CodePanel';
import { ComplexityPanel } from '../components/ComplexityPanel';
import { ExplanationBar } from '../components/ExplanationBar';
import { InputPanel } from '../components/InputPanel';
import { Player } from '../components/Player';
import { getAlgorithm } from '../core/registry';
import type { ParamMap, RegisteredAlgorithm } from '../core/define';
import { ZERO_COUNTERS, type Frame } from '../core/types';
import { PlaybackProvider, usePlayback } from '../playback/PlaybackProvider';
import { StructureCanvas } from '../renderers';
import { Link, useRouter } from '../router/router';
import { CATEGORY_LABEL } from '../catalog';

const NO_FRAMES: readonly Frame[] = [];

function searchToParams(search: string): ParamMap {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(search)) params[key] = value;
  return params;
}

function paramsToSearch(params: ParamMap, defaults: ParamMap): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === defaults[key]) continue;
    query.set(key, value);
  }
  const text = query.toString();
  return text.length > 0 ? `?${text}` : '';
}

export interface VisualizePageProps {
  readonly algorithmId: string;
}

export function VisualizePage({ algorithmId }: VisualizePageProps): ReactNode {
  const algorithm = getAlgorithm(algorithmId);

  if (algorithm === undefined) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          No algorithm registered as &quot;{algorithmId}&quot;
        </h1>
        <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
          It is probably still on the roadmap. The home page marks which phase it belongs to.
        </p>
        <Link
          to="/"
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Back to all algorithms
        </Link>
      </div>
    );
  }

  return <AlgorithmView algorithm={algorithm} />;
}

function AlgorithmView({ algorithm }: { algorithm: RegisteredAlgorithm }): ReactNode {
  const { search, navigate } = useRouter();

  const params = useMemo(() => searchToParams(search), [search]);
  const merged = useMemo<ParamMap>(() => ({ ...algorithm.defaults, ...params }), [algorithm, params]);

  const result = useMemo(() => algorithm.build(params), [algorithm, params]);
  const frames = result.ok ? result.frames : NO_FRAMES;
  const error = result.ok ? null : result.error;

  useEffect(() => {
    document.title = `${algorithm.meta.name} - DSA Visualizer`;
  }, [algorithm.meta.name]);

  const onApply = useCallback(
    (next: ParamMap) => {
      navigate(`/visualize/${algorithm.meta.id}${paramsToSearch(next, algorithm.defaults)}`);
    },
    [algorithm.defaults, algorithm.meta.id, navigate],
  );

  return (
    <PlaybackProvider frames={frames}>
      <div className="flex h-full min-h-0 flex-col gap-2 p-2 lg:p-3">
        <AlgorithmHeader algorithm={algorithm} />

        <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-h-0 flex-col gap-2">
            <Canvas error={error} />
            <Commentary />
            <Player />
            <ShortcutHints />
          </div>

          <aside className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-0.5">
            <SourceView algorithm={algorithm} />
            <StackView />
            <CountersView algorithm={algorithm} />
            <InputPanel algorithm={algorithm} params={merged} error={error} onApply={onApply} />
          </aside>
        </div>
      </div>
    </PlaybackProvider>
  );
}

function AlgorithmHeader({ algorithm }: { algorithm: RegisteredAlgorithm }): ReactNode {
  const [copied, setCopied] = useState(false);

  const copyLink = (): void => {
    void navigator.clipboard.writeText(window.location.href).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => setCopied(false),
    );
  };

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">
        {algorithm.meta.name}
      </h1>
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        {CATEGORY_LABEL[algorithm.meta.category]}
      </span>
      <p className="hidden text-xs text-slate-500 dark:text-slate-400 md:block">
        {algorithm.meta.blurb}
      </p>
      <button
        type="button"
        onClick={copyLink}
        className="ml-auto rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        title="Copy a link that reproduces this exact run"
      >
        {copied ? 'Link copied' : 'Copy link'}
      </button>
    </div>
  );
}

function Canvas({ error }: { error: string | null }): ReactNode {
  const { frame, frames, jumped, frameDurationMs } = usePlayback();

  return (
    <div
      className="min-h-0 flex-1 rounded-xl border border-slate-200 p-1"
      style={{ backgroundColor: 'var(--viz-bg)', borderColor: 'var(--viz-grid)' }}
    >
      {error !== null ? (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
          <p className="text-sm font-medium text-rose-600 dark:text-rose-400">Could not run this input</p>
          <p className="max-w-md text-xs text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      ) : frame === null ? (
        <div className="flex h-full items-center justify-center text-sm text-slate-400">
          Nothing to draw.
        </div>
      ) : (
        <StructureCanvas
          frame={frame}
          frames={frames}
          animate={!jumped && frameDurationMs >= 60}
          durationMs={frameDurationMs}
        />
      )}
    </div>
  );
}

function Commentary(): ReactNode {
  const { frame } = usePlayback();
  return <ExplanationBar frame={frame} />;
}

function SourceView({ algorithm }: { algorithm: RegisteredAlgorithm }): ReactNode {
  const { frame } = usePlayback();
  return (
    <div className="flex max-h-[40vh] min-h-[14rem] flex-col">
      <CodePanel lines={algorithm.codeLines} activeLine={frame?.codeLine ?? 0} />
    </div>
  );
}

function StackView(): ReactNode {
  const { frame } = usePlayback();
  return <CallStackPanel stack={frame?.callStack ?? []} />;
}

function CountersView({ algorithm }: { algorithm: RegisteredAlgorithm }): ReactNode {
  const { frame } = usePlayback();
  return <ComplexityPanel meta={algorithm.meta} counters={frame?.counters ?? ZERO_COUNTERS} />;
}

const SHORTCUTS: ReadonlyArray<readonly [string, string]> = [
  ['space', 'play / pause'],
  ['left right', 'step'],
  ['up down', 'speed'],
  ['R', 'reset'],
];

function ShortcutHints(): ReactNode {
  return (
    <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-slate-400 sm:flex">
      {SHORTCUTS.map(([keys, action]) => (
        <span key={keys} className="flex items-center gap-1">
          <kbd className="rounded border border-slate-300 px-1 py-px font-mono text-[9px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {keys}
          </kbd>
          {action}
        </span>
      ))}
    </div>
  );
}
