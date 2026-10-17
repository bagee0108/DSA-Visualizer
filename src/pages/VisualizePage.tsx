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
import { FrameAnnouncer } from '../components/FrameAnnouncer';
import { InputPanel } from '../components/InputPanel';
import { Player } from '../components/Player';
import { PrecomputeBar } from '../components/PrecomputeBar';
import { ProgressStars, TierLabel } from '../components/level';
import { Button, ButtonLink, Kbd } from '../components/ui';
import { levelFor, neighbour, type Level } from '../core/levels';
import { getAlgorithm } from '../core/registry';
import { usePageMeta } from '../hooks/usePageMeta';
import type { ParamMap, RegisteredAlgorithm } from '../core/define';
import { ZERO_COUNTERS } from '../core/types';
import { PlaybackProvider, usePlayback } from '../playback/PlaybackProvider';
import { useChunkedBuild } from '../playback/useChunkedBuild';
import { StructureCanvas } from '../renderers';
import { useRouter } from '../router/router';
import { CATEGORY_LABEL } from '../catalog';

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

  if (algorithm === undefined) return <UnknownAlgorithm id={algorithmId} />;

  return <AlgorithmView algorithm={algorithm} />;
}

function UnknownAlgorithm({ id }: { id: string }): ReactNode {
  usePageMeta(`Not found: ${id} - Lowlink`);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-title font-semibold text-fg">No algorithm registered as &quot;{id}&quot;</h1>
      <p className="max-w-md text-meta text-fg-dim">
        It is probably still being built. The path on the home page marks every level that is coming.
      </p>
      <ButtonLink to="/" variant="secondary">
        Back to the path
      </ButtonLink>
    </div>
  );
}

function AlgorithmView({ algorithm }: { algorithm: RegisteredAlgorithm }): ReactNode {
  const { search, navigate } = useRouter();

  // Params too long for the URL live here instead; any navigation drops them.
  const [unshareable, setUnshareable] = useState<ParamMap | null>(null);
  useEffect(() => setUnshareable(null), [search, algorithm]);

  const params = useMemo(() => unshareable ?? searchToParams(search), [search, unshareable]);
  const merged = useMemo<ParamMap>(() => ({ ...algorithm.defaults, ...params }), [algorithm, params]);

  const { frames, error, building, progress } = useChunkedBuild(algorithm, params);

  usePageMeta(`${algorithm.meta.name} - Lowlink`);

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
    <PlaybackProvider frames={frames} building={building} progress={progress}>
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

function Chevron({ direction }: { direction: -1 | 1 }): ReactNode {
  return (
    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d={direction < 0 ? 'M7.5 2.5 4 6l3.5 3.5' : 'M4.5 2.5 8 6 4.5 9.5'} />
    </svg>
  );
}

function LevelStep({ level, direction }: { level: Level | undefined; direction: -1 | 1 }): ReactNode {
  if (level === undefined) return null;
  return (
    <ButtonLink to={`/visualize/${level.id}`} variant="ghost" size="sm" className="font-mono font-normal">
      <span className="sr-only">{direction < 0 ? 'Previous level: ' : 'Next level: '}{level.name}</span>
      <span aria-hidden="true" className="flex items-center gap-1">
        {direction < 0 && <Chevron direction={-1} />}
        lv {String(level.number).padStart(2, '0')}
        {direction > 0 && <Chevron direction={1} />}
      </span>
    </ButtonLink>
  );
}

function AlgorithmHeader({ algorithm, shareable }: { algorithm: RegisteredAlgorithm; shareable: boolean }): ReactNode {
  const [copied, setCopied] = useState(false);
  const what = algorithm.meta.structureKind === 'graph' ? 'graph' : 'input';
  const level = levelFor(algorithm.meta.id);
  const folder = level?.lane ?? CATEGORY_LABEL[algorithm.meta.category].toLowerCase();

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
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-panel px-3 py-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="font-mono text-meta text-fg-mute" aria-hidden="true">
          <span className="text-accent-ink">$</span> ~/{folder}/
        </span>
        <h1 className="font-display text-page font-bold text-fg">{algorithm.meta.name}</h1>
      </div>

      {level !== undefined && (
        <div className="flex items-center gap-3 text-micro text-fg-mute">
          <span className="font-mono tabular-nums">lv {String(level.number).padStart(2, '0')}</span>
          <span className="h-3.5 w-px bg-line" aria-hidden="true" />
          <TierLabel tier={level.tier} />
          <span className="h-3.5 w-px bg-line" aria-hidden="true" />
          <ProgressStars withLabel />
        </div>
      )}

      <p className="hidden min-w-0 flex-1 text-meta text-fg-dim xl:block">{algorithm.meta.blurb}</p>

      <div className="ml-auto flex items-center gap-1">
        {!shareable && (
          <span
            className="rounded-xs border border-edge px-1.5 py-0.5 font-mono text-micro text-fg-dim"
            title={`The ${what} is longer than a URL can safely carry, so this run lives only in this tab.`}
          >
            custom {what} - not shareable
          </span>
        )}
        {/* Reserved for the quiz mode switch once quizzes exist. Empty on purpose. */}
        <div className="hidden w-32 lg:block" aria-hidden="true" />
        {level !== undefined && (
          <>
            <LevelStep level={neighbour(level, -1)} direction={-1} />
            <LevelStep level={neighbour(level, 1)} direction={1} />
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={copyLink}
          disabled={!shareable}
          title={shareable ? 'Copy a link that reproduces this exact run' : `This ${what} does not fit in a URL`}
        >
          {copied ? 'Link copied' : 'Copy link'}
        </Button>
      </div>
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
        <PrecomputeBar />
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
  return (
    <>
      <ExplanationBar frame={frame} animate={!jumped && frameDurationMs >= 250} />
      <FrameAnnouncer />
    </>
  );
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
          <Kbd>{keys}</Kbd>
          {action}
        </span>
      ))}
      <span className="ml-auto tabular-nums" title="How long the current frame stays on screen">
        {(frameDurationMs / 1000).toFixed(1)}s per frame
      </span>
    </div>
  );
}
