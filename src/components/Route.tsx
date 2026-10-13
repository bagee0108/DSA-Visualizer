/**
 * The learning path as one winding route. Each lane is a track (arrays,
 * trees, graphs, advanced); lanes alternate direction and are joined by
 * half-circle turns, so the whole path is a single line. The line is lit
 * through the last open level and dashed beyond it.
 *
 * It is one line so it can move as one: on arrival the lit part draws itself
 * from level 1, each open node lights as the line reaches it, then the dashed
 * remainder fades in. That is the page's one orchestrated moment, and it is
 * skipped entirely under reduced motion. When progress exists it fills along
 * the same line.
 *
 * Narrower than the route needs, it becomes a single vertical list.
 */

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { isOpen, LANE_IDS, LEVELS, TIER_LABEL, type Level } from '../core/levels';
import { Link } from '../router/router';
import { ProgressStars, TierGlyph } from './level';
import { FOCUS_RING } from './ui';

/**
 * Below this width the route stops winding and becomes a list. A ten-level
 * lane gives each stop about 85px here; any narrower and long single words
 * ("Topological", "algorithm") run into the next stop's name.
 */
const WIND_MIN_WIDTH = 1100;
const LANE_GAP = 164;
const TURN = LANE_GAP / 2;
const TOP = 44;
const STOP_BLOCK = 132;

interface Stop {
  readonly level: Level;
  readonly lane: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** Distance along the route from level 1, in px. */
  readonly along: number;
}

interface Geometry {
  readonly stops: readonly Stop[];
  readonly left: number;
  readonly right: number;
  readonly height: number;
}

function laneY(lane: number): number {
  return TOP + lane * LANE_GAP;
}

function layout(width: number): Geometry {
  const left = TURN + 4;
  const right = width - TURN - 4;
  const stops: Stop[] = [];
  let along = 0;
  let previous: Stop | undefined;

  LANE_IDS.forEach((laneId, lane) => {
    const levels = LEVELS.filter((level) => level.lane === laneId);
    const step = (right - left) / levels.length;
    const forward = lane % 2 === 0;
    levels.forEach((level, k) => {
      const x = forward ? left + (k + 0.5) * step : right - (k + 0.5) * step;
      const y = laneY(lane);
      if (previous !== undefined) {
        if (previous.lane === lane) along += Math.abs(x - previous.x);
        else {
          // run out to the edge, round the half-circle turn, run back in
          const edge = previous.lane % 2 === 0 ? right : left;
          along += Math.abs(edge - previous.x) + Math.PI * TURN + Math.abs(edge - x);
        }
      }
      const stop = { level, lane, x, y, width: Math.min(step - 8, 136), along };
      stops.push(stop);
      previous = stop;
    });
  });

  return { stops, left, right, height: laneY(LANE_IDS.length - 1) + STOP_BLOCK };
}

/** The route through stops[0..end] as one SVG path. */
function routePath(geometry: Geometry, end: number): string {
  const { stops, left, right } = geometry;
  const first = stops[0];
  if (first === undefined) return '';
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i <= end; i++) {
    const stop = stops[i];
    const before = stops[i - 1];
    if (stop === undefined || before === undefined) continue;
    if (stop.lane !== before.lane) {
      const forward = before.lane % 2 === 0;
      const edge = forward ? right : left;
      d += ` L ${edge} ${before.y} A ${TURN} ${TURN} 0 0 ${forward ? 1 : 0} ${edge} ${stop.y}`;
    }
    d += ` L ${stop.x} ${stop.y}`;
  }
  return d;
}

function stopLabel(level: Level, open: boolean): string {
  return `Level ${level.number}, ${level.lane}: ${level.name}, ${TIER_LABEL[level.tier]}${open ? '' : ', coming soon'}`;
}

const NODE = 'relative z-10 h-[18px] w-[18px] shrink-0 rounded-full border-2';

/** A level that is still being built: dashed, and never a link. */
function SoonNode(): ReactNode {
  return <span className={`${NODE} border-dashed border-edge bg-ground`} />;
}

function StopBody({ level, open }: { level: Level; open: boolean }): ReactNode {
  return (
    <>
      <span className="font-mono text-micro tabular-nums text-fg-mute">{String(level.number).padStart(2, '0')}</span>
      <span
        className={`font-display text-meta leading-tight font-stretch-semi-condensed text-balance ${open ? 'font-semibold text-fg' : 'text-fg-mute'}`}
      >
        {level.name}
      </span>
      <span className="flex items-center justify-center gap-1.5 text-micro text-fg-mute">
        <TierGlyph tier={level.tier} />
        {level.number === 1 ? (
          <span className="font-display font-semibold font-stretch-semi-condensed text-accent-ink">start here</span>
        ) : open ? (
          TIER_LABEL[level.tier]
        ) : (
          <span className="rounded-xs border border-line px-1 font-mono">soon</span>
        )}
      </span>
      {open && <ProgressStars />}
    </>
  );
}

function WindingRoute({ width }: { width: number }): ReactNode {
  const geometry = useMemo(() => layout(width), [width]);
  const lastOpen = useMemo(
    () => geometry.stops.reduce((at, stop, index) => (isOpen(stop.level) ? index : at), 0),
    [geometry],
  );
  const litLength = geometry.stops[lastOpen]?.along ?? 0;

  // The reveal is keyframes whose resting state is the finished drawing, so
  // the page is complete whether or not it plays: under reduced motion the
  // global rule collapses it to its last frame. It runs once per mount.
  return (
    <div className="relative" style={{ height: geometry.height }}>
      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <path
          d={routePath(geometry, geometry.stops.length - 1)}
          fill="none"
          className="stroke-edge"
          strokeWidth="2"
          strokeDasharray="4 6"
          strokeLinecap="round"
          style={{ animation: 'viz-route-fade var(--duration-slow) var(--ease-enter) var(--duration-reveal) backwards' }}
        />
        <path
          d={routePath(geometry, lastOpen)}
          fill="none"
          className="stroke-accent"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={litLength + 2}
          strokeDashoffset={0}
          style={
            {
              '--route-length': litLength + 2,
              animation: 'viz-route-draw var(--duration-reveal) var(--ease-enter) backwards',
            } as CSSProperties
          }
        />
      </svg>

      {LANE_IDS.map((lane, index) => {
        const forward = index % 2 === 0;
        const count = LEVELS.filter((level) => level.lane === lane).length;
        return (
          <div
            key={lane}
            aria-hidden="true"
            className={`absolute flex items-baseline gap-2.5 whitespace-nowrap ${forward ? '' : '-translate-x-full'}`}
            style={{ left: forward ? geometry.left : geometry.right, top: laneY(index) - 40 }}
          >
            <span className="font-display text-ui font-semibold font-stretch-semi-condensed text-fg">
              <span className="font-normal text-fg-mute">~/</span>
              {lane}
            </span>
            <span className="font-mono text-micro tabular-nums text-fg-mute">{count} levels</span>
          </div>
        );
      })}

      <ol className="contents">
        {geometry.stops.map((stop) => {
          const open = isOpen(stop.level);
          const fraction = litLength === 0 ? 0 : Math.min(1, stop.along / litLength);
          const body = <StopBody level={stop.level} open={open} />;
          const place: CSSProperties = { left: stop.x, top: stop.y - 9, width: stop.width };
          return (
            <li key={stop.level.id} className="absolute -translate-x-1/2" style={place}>
              {open ? (
                <Link
                  to={`/visualize/${stop.level.id}`}
                  className={`group grid justify-items-center gap-1 rounded-sm pb-1 text-center ${FOCUS_RING}`}
                  aria-label={stopLabel(stop.level, true)}
                >
                  <LitNode level={stop.level} delay={fraction} />
                  <span className="grid justify-items-center gap-1 rounded-xs px-1 transition-colors group-hover:bg-raised" aria-hidden="true">
                    {body}
                  </span>
                </Link>
              ) : (
                <div className="grid justify-items-center gap-1 pb-1 text-center" aria-label={stopLabel(stop.level, false)} role="group">
                  <SoonNode />
                  <span className="grid justify-items-center gap-1 px-1" aria-hidden="true">
                    {body}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** An open node, which lights when the drawing line reaches it. */
function LitNode({ level, delay }: { level: Level; delay: number }): ReactNode {
  const start = level.number === 1;
  return (
    <span
      className={`${NODE} border-accent ${
        start ? 'bg-accent shadow-[0_0_0_3px_var(--color-ground),0_0_0_4.5px_var(--color-accent)]' : 'bg-ground'
      }`}
      style={{
        animation: `viz-node-light var(--duration-base) var(--ease-enter) calc(var(--duration-reveal) * ${delay.toFixed(3)}) backwards`,
      }}
    />
  );
}

/** The same route, straightened into one column for narrow screens. */
function ListRoute(): ReactNode {
  return (
    <ol>
      {LEVELS.map((level, index) => {
        const open = isOpen(level);
        const newLane = index === 0 || LEVELS[index - 1]?.lane !== level.lane;
        return (
          <li key={level.id}>
            {newLane && (
              <p className="pt-4 pb-1 font-display text-ui font-semibold font-stretch-semi-condensed text-fg" aria-hidden="true">
                <span className="font-normal text-fg-mute">~/</span>
                {level.lane}
              </p>
            )}
            <ListStop level={level} open={open} last={index === LEVELS.length - 1} />
          </li>
        );
      })}
    </ol>
  );
}

function ListStop({ level, open, last }: { level: Level; open: boolean; last: boolean }): ReactNode {
  const inner = (
    <>
      {!last && (
        <span
          aria-hidden="true"
          className={`absolute top-6 -bottom-2 left-[8px] ${open ? 'w-0.5 bg-accent' : 'border-l-2 border-dashed border-edge'}`}
        />
      )}
      {open ? <span className={`${NODE} mt-0.5 border-accent ${level.number === 1 ? 'bg-accent' : 'bg-ground'}`} /> : <SoonNode />}
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-micro tabular-nums text-fg-mute">{String(level.number).padStart(2, '0')}</span>
          <span className={`font-display text-meta font-stretch-semi-condensed ${open ? 'font-semibold text-fg' : 'text-fg-mute'}`}>
            {level.name}
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-micro text-fg-mute">
          <TierGlyph tier={level.tier} />
          {level.number === 1 ? <span className="text-accent-ink">start here</span> : TIER_LABEL[level.tier]}
          {!open && <span className="rounded-xs border border-line px-1 font-mono">soon</span>}
        </span>
      </span>
      {open && <ProgressStars />}
    </>
  );
  const row = 'relative flex items-start gap-3 rounded-sm py-2 pr-2';
  return open ? (
    <Link to={`/visualize/${level.id}`} aria-label={stopLabel(level, true)} className={`${row} transition-colors hover:bg-raised ${FOCUS_RING}`}>
      {inner}
    </Link>
  ) : (
    <div className={row} role="group" aria-label={stopLabel(level, false)}>
      {inner}
    </div>
  );
}

export function Route(): ReactNode {
  const box = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const node = box.current;
    if (node === null) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={box} aria-label="Levels in order" role="region">
      {width >= WIND_MIN_WIDTH ? <WindingRoute width={width} /> : width > 0 ? <ListRoute /> : null}
    </div>
  );
}

