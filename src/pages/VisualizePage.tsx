/**
 * One visualization screen: canvas, explanation, transport, code, call stack,
 * complexity readout and custom input. The canvas is the product, so every
 * other surface docks around it with a hairline and no gap.
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

/**
 * Longest query string that is written into the URL. Past it the run is held
 * in memory and marked not shareable; see CONTRIBUTING "Graphs".
 */
export const MAX_QUERY_LENGTH = 4000;

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
  const text = query.toString().replace(/%2C/g, ',').replace(/%3A/g, ':');
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
        <h1 className="text-title font-semibold text-fg">
          No algorithm registered as &quot;{algorithmId}&quot;
        </h1>
        <p className="max-w-md text-meta text-fg-dim">
          It is probably still on the roadmap. The home page marks which phase it belongs to.
        </p>
        <Link
          to="/"
          className="rounded-sm border border-edge bg-raised px-3 py-1 text-meta font-medium text-fg transition-colors hover:border-fg-mute"
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

  // Params too long for the URL live here instead; any navigation drops them.
  const [unshareable, setUnshareable] = useState<ParamMap | null>(null);
  useEffect(() => setUnshareable(null), [search, algorithm]);

  const params = useMemo(() => unshareable ?? searchToParams(search), [search, unshareable]);
  const merged = useMemo<ParamMap>(() => ({ ...algorithm.defaults, ...params }), [algorithm, params]);

  const result = useMemo(() => algorithm.build(params), [algorithm, params]);
  const frames = result.ok ? result.frames : NO_FRAMES;
  const error = result.ok ? null : result.error;

  useEffect(() => {
    document.title = `${algorithm.meta.name} - DSA Visualizer`;
  }, [algorithm.meta.name]);

  const onApply = useCallback(
    (next: ParamMap) => {
      const query = paramsToSearch(next, algorithm.defaults);
      if (query.length > MAX_QUERY_LENGTH) {
        setUnshareable(next);
        return;
      }
      setUnshareable(null);
      navigate(`/visualize/${algorithm.meta.id}${query}`);
    },
    [algorithm.defaults, algorithm.meta.id, navigate],
  );

  return (
    <PlaybackProvider frames={frames}>
      <div className="flex h-full min-h-0 flex-col">
        <AlgorithmHeader algorithm={algorithm} shareable={unshareable === null} />

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="flex min-h-0 flex-col lg:border-r lg:border-line">
            <Canvas error={error} />
            <Commentary />
            <Player />
            <StatusLine />
          </div>

          <aside className="flex min-h-0 flex-col overflow-y-auto border-t border-line bg-panel lg:border-t-0">
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

function AlgorithmHeader({ algorithm, shareable }: { algorithm: RegisteredAlgorithm; shareable: boolean }): ReactNode {
  const [copied, setCopied] = useState(false);
  const what = algorithm.meta.structureKind === 'graph' ? 'graph' : 'input';

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
    <header className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line bg-panel px-3 py-1.5">
      <h1 className="text-title font-semibold tracking-tight text-fg">{algorithm.meta.name}</h1>
      <span className="rounded-xs bg-raised px-1.5 py-0.5 font-mono text-micro uppercase tracking-wider text-fg-mute">
        {CATEGORY_LABEL[algorithm.meta.category]}
      </span>
      <p className="hidden text-meta text-fg-dim md:block">{algorithm.meta.blurb}</p>
      {!shareable && (
        <span
          className="ml-auto rounded-xs border border-edge px-1.5 py-0.5 font-mono text-micro text-fg-dim"
          title={`The ${what} is longer than a URL can safely carry, so this run lives only in this tab.`}
        >
          custom {what} - not shareable
        </span>
      )}
      <button
        type="button"
        onClick={copyLink}
        disabled={!shareable}
        className={`${shareable ? 'ml-auto' : ''} rounded-xs px-1.5 py-0.5 font-mono text-micro text-fg-mute transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}
        title={shareable ? 'Copy a link that reproduces this exact run' : `This ${what} does not fit in a URL`}
      >
        {copied ? 'link copied' : 'copy link'}
      </button>
    </header>
  );
}

function Canvas({ error }: { error: string | null }): ReactNode {
  const { frame, frames, jumped, frameDurationMs } = usePlayback();

  return (
    <div className="min-h-0 flex-1 bg-ground p-1">
      {error !== null ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
          <p className="text-meta font-medium text-danger">Could not run this input</p>
          <p className="max-w-md text-meta text-fg-dim">{error}</p>
        </div>
      ) : frame === null ? (
        <div className="flex h-full items-center justify-center text-meta text-fg-mute">
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
  const { frame, frameDurationMs, jumped } = usePlayback();
  // Below a quarter of a second the fade never finishes and reads as flicker.
  return <ExplanationBar frame={frame} animate={!jumped && frameDurationMs >= 250} />;
}

function SourceView({ algorithm }: { algorithm: RegisteredAlgorithm }): ReactNode {
  const { frame } = usePlayback();
  return (
    <div className="flex max-h-[40vh] min-h-56 flex-col">
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

function StatusLine(): ReactNode {
  const { frameDurationMs } = usePlayback();

  return (
    <div className="hidden shrink-0 items-center gap-3 border-t border-line bg-panel px-3 py-1 font-mono text-micro text-fg-mute sm:flex">
      {SHORTCUTS.map(([keys, action]) => (
        <span key={keys} className="flex items-center gap-1">
          <kbd className="rounded-xs border border-line px-1 text-fg-dim">{keys}</kbd>
          {action}
        </span>
      ))}
      <span className="ml-auto tabular-nums" title="How long the current frame stays on screen">
        {(frameDurationMs / 1000).toFixed(1)}s per frame
      </span>
    </div>
  );
}
