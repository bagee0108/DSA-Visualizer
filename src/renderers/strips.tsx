/** A row of chips under a structure: queue, stack, priority queue or output order. */

import type { ReactNode } from 'react';

import type { EntityId, HighlightRole, Strip } from '../core/types';
import { ROLE_COLOR } from './roles';

export const STRIP_HEIGHT = 46;
export const VIEW_W = 1000;
export const PAD_X = 16;
/** Past this many chips a strip shows only the end that matters and a +n marker. */
const MAX_CHIPS = 24;

const HINT: Record<Strip['kind'], string> = {
  queue: 'front -> back',
  stack: 'bottom -> top',
  pq: 'min first',
  output: 'in order',
};

export interface StripRowProps {
  readonly strip: Strip;
  readonly y: number;
  readonly roles: ReadonlyMap<EntityId, HighlightRole>;
  readonly transition: string;
}

export function StripRow({ strip, y, roles, transition }: StripRowProps): ReactNode {
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

  return (
    <g>
      <text x={PAD_X} y={y + 16} fontSize={11} fill="var(--viz-text-dim)" className="font-mono">
        {strip.label}
      </text>
      <text x={PAD_X} y={y + 29} fontSize={8.5} fill="var(--viz-text-dim)" opacity={0.7} className="font-mono">
        {HINT[strip.kind]}
      </text>
      {strip.items.length === 0 && (
        <text x={PAD_X + labelWidth} y={y + 20} fontSize={10} fill="var(--viz-text-dim)" opacity={0.6}>
          empty
        </text>
      )}
      {overflow > 0 && (
        <text
          x={PAD_X + labelWidth + markerIndex * chip + chipW / 2}
          y={y + 18}
          textAnchor="middle"
          fontSize={10}
          fill="var(--viz-text-dim)"
          className="font-mono"
        >
          +{overflow}
        </text>
      )}
      {items.map((item, index) => {
        const x = PAD_X + labelWidth + (index + offset) * chip;
        const role = roles.get(`${strip.kind}:${item.id}`) ?? roles.get(item.id);
        const fill = role === undefined ? 'var(--viz-excluded)' : ROLE_COLOR[role];
        return (
          <g key={`${strip.kind}-${item.id}`} style={{ transform: `translate(${x}px, ${y}px)`, transition }}>
            <rect width={chipW} height={28} rx={5} fill={fill} opacity={role === undefined ? 0.7 : 1} />
            <text
              x={chipW / 2}
              y={18}
              textAnchor="middle"
              fontSize={chipW < 30 ? 9 : 11}
              fontWeight={600}
              fill={role === undefined ? 'var(--viz-text)' : '#fff'}
              className="font-mono"
            >
              {item.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
