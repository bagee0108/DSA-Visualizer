/** A row of chips under a structure: queue, stack, priority queue or output order. */

import { useState, type ReactNode } from 'react';

import type { EntityId, HighlightRole, Strip, StripItem } from '../core/types';
import type { InkMap } from './ink';
import { VIEW_W } from './canvas';
import { markFor, rectMark, ROLE_COLOR } from './roles';

export const STRIP_HEIGHT = 46;
export const PAD_X = 16;
/** Past this many chips a strip shows only the end that matters and a +n marker. */
const MAX_CHIPS = 24;
/** Wider than this many departures at once and it was a jump, not a step. */
const MAX_GHOSTS = 2;
const FADE_W = 46;

const HINT: Record<Strip['kind'], string> = {
  queue: 'front -> back',
  stack: 'bottom -> top',
  pq: 'min first',
  output: 'in order',
};

interface Ghost {
  readonly id: string;
  readonly label: string;
}

interface Diff {
  readonly signature: string;
  readonly items: readonly StripItem[];
  readonly ghosts: readonly Ghost[];
  readonly arrived: ReadonlySet<string>;
}

const EMPTY: ReadonlySet<string> = new Set();

function signatureOf(items: readonly StripItem[]): string {
  return items.map((item) => item.id).join('|');
}

/**
 * What changed in this strip since the last render, derived from the lists
 * themselves rather than from playback direction. Stepping backwards puts a
 * chip back at the front, and that reads as an arrival at the front, which is
 * exactly what it is.
 */
function useDiff(items: readonly StripItem[], animate: boolean): Diff {
  const signature = signatureOf(items);
  const [snap, setSnap] = useState<Diff>({ signature, items, ghosts: [], arrived: EMPTY });

  if (snap.signature === signature) return snap;

  let next: Diff = { signature, items, ghosts: [], arrived: EMPTY };
  if (animate) {
    const current = new Set(items.map((item) => item.id));
    const previous = new Set(snap.items.map((item) => item.id));
    const ghosts = snap.items.filter((item) => !current.has(item.id));
    next = {
      signature,
      items,
      ghosts: ghosts.length > MAX_GHOSTS ? [] : ghosts,
      arrived: new Set(items.filter((item) => !previous.has(item.id)).map((item) => item.id)),
    };
  }
  setSnap(next);
  return next;
}

export interface StripRowProps {
  readonly strip: Strip;
  readonly y: number;
  readonly roles: ReadonlyMap<EntityId, HighlightRole>;
  readonly transition: string;
  readonly animate: boolean;
  readonly ink: InkMap;
}

export function StripRow({ strip, y, roles, transition, animate, ink }: StripRowProps): ReactNode {
  const { ghosts, arrived } = useDiff(strip.items, animate);

  const labelWidth = 92;
  const available = VIEW_W - PAD_X * 2 - labelWidth;
  // Chips are as wide as their longest label needs, so fewer fit when labels are words.
  const longest = strip.items.reduce((max, item) => Math.max(max, item.label.length), 1);
  const needed = Math.max(44, 12 + longest * 6.8);
  const limit = Math.min(MAX_CHIPS, Math.max(3, Math.floor(available / needed)));
  const overflow = Math.max(0, strip.items.length - limit);
  // Queues and priority queues matter at the front; stacks and output at the end.
  const tailSide = strip.kind === 'stack' || strip.kind === 'output';
  const items = overflow === 0 ? strip.items : tailSide ? strip.items.slice(overflow) : strip.items.slice(0, limit);
  const slots = items.length + (overflow > 0 ? 1 : 0);
  const chip = Math.min(needed, available / Math.max(1, slots));
  const chipW = chip - 4;
  const markerIndex = tailSide ? 0 : items.length;
  const offset = tailSide && overflow > 0 ? 1 : 0;

  const chipsX = PAD_X + labelWidth;
  // A stack loses its top, a queue loses its front; ghosts leave that way.
  const ghostX = chipsX + (tailSide ? (items.length + offset) * chip : 0);
  const fadeId = `viz-strip-fade-${strip.kind}-${Math.round(y)}`;

  return (
    <g>
      <defs>
        <linearGradient id={fadeId} x1={tailSide ? '1' : '0'} x2={tailSide ? '0' : '1'} y1="0" y2="0">
          <stop offset="0%" stopColor="var(--viz-bg)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--viz-bg)" stopOpacity="1" />
        </linearGradient>
      </defs>

      <text x={PAD_X} y={y + 16} fontSize={11} fill="var(--viz-text-dim)" className="font-mono">
        {strip.label}
      </text>
      <text x={PAD_X} y={y + 29} fontSize={8.5} fill="var(--viz-text-dim)" opacity={0.7} className="font-mono">
        {HINT[strip.kind]}
      </text>
      {strip.items.length === 0 && (
        <text x={chipsX} y={y + 20} fontSize={10} fill="var(--viz-text-dim)" opacity={0.6}>
          empty
        </text>
      )}

      {ghosts.map((ghost) => (
        <g key={`ghost-${ghost.id}`} style={{ transform: `translate(${ghostX}px, ${y}px)` }}>
          <g
            style={{
              animation: `viz-chip-out-${tailSide ? 'right' : 'left'} var(--duration-base) var(--ease-exit) forwards`,
            }}
          >
            <rect width={chipW} height={28} rx={3} fill="var(--viz-excluded)" opacity={0.7} />
            <text
              x={chipW / 2}
              y={18}
              textAnchor="middle"
              fontSize={chipW < 30 ? 9 : 11}
              fontWeight={600}
              fill={ink.excluded}
              className="font-mono"
            >
              {ghost.label}
            </text>
          </g>
        </g>
      ))}

      {items.map((item, index) => {
        const x = chipsX + (index + offset) * chip;
        const role = roles.get(`${strip.kind}:${item.id}`) ?? roles.get(item.id);
        const fill = role === undefined ? 'var(--viz-excluded)' : ROLE_COLOR[role];
        // Arrivals come in from the edge they actually entered by.
        const entering = arrived.has(item.id);
        const fromLeft = index === 0;
        const mark = markFor(role);
        const stroke = mark === null ? null : rectMark(mark, chipW, 28);
        return (
          <g key={`${strip.kind}-${item.id}`} style={{ transform: `translate(${x}px, ${y}px)`, transition }}>
            <g
              style={
                entering
                  ? { animation: `viz-chip-in-${fromLeft ? 'left' : 'right'} var(--duration-base) var(--ease-enter) backwards` }
                  : undefined
              }
            >
              <rect width={chipW} height={28} rx={3} fill={fill} opacity={role === undefined ? 0.7 : 1} />
              {stroke !== null && (
                <rect
                  x={stroke.width / 2}
                  y={stroke.width / 2}
                  width={chipW - stroke.width}
                  height={28 - stroke.width}
                  rx={2}
                  fill="none"
                  stroke={ink[role ?? 'excluded']}
                  strokeWidth={stroke.width}
                  strokeDasharray={stroke.dash}
                />
              )}
              <text
                x={chipW / 2}
                y={18}
                textAnchor="middle"
                fontSize={chipW < 30 ? 9 : 11}
                fontWeight={600}
                fill={ink[role ?? 'excluded']}
                className="font-mono"
              >
                {item.label}
              </text>
            </g>
          </g>
        );
      })}

      {overflow > 0 && (
        <>
          <rect
            x={tailSide ? chipsX : chipsX + (items.length + offset) * chip - FADE_W}
            y={y}
            width={FADE_W}
            height={28}
            fill={`url(#${fadeId})`}
          />
          <text
            x={chipsX + markerIndex * chip + chipW / 2}
            y={y + 18}
            textAnchor="middle"
            fontSize={10}
            fill="var(--viz-text-dim)"
            className="font-mono"
          >
            +{overflow}
          </text>
        </>
      )}
    </g>
  );
}
