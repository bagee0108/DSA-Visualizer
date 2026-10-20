/**
 * The strips of a frame - its queue, stack, priority queue or output - drawn
 * apart from the structure, in the panel under the canvas, so the page can
 * size and hide them on their own. Same rows, same coordinates and the same
 * motion as when a renderer draws them under its band.
 */

import { memo, useMemo, type ReactNode } from 'react';

import type { Frame, Strip } from '../core/types';
import { counted, VIEW_W } from './canvas';
import { useInk } from './ink';
import { resolveRoles } from './roles';
import { STRIP_HEIGHT, StripRow } from './strips';

/** Space above the first row; a row's chips are 28 high, its label sits inside the same height. */
const TOP = 8;

const NO_STRIPS: readonly Strip[] = [];

export function stripsOf(frame: Frame | null): readonly Strip[] {
  const structure = frame?.structure;
  if (structure === undefined || structure.kind === 'array') return NO_STRIPS;
  return structure.strips;
}

/** The panel's viewBox height for this many rows. */
export function stripsHeight(rows: number): number {
  return rows === 0 ? 0 : TOP + rows * STRIP_HEIGHT - 8;
}

function describe(strips: readonly Strip[]): string {
  return strips.map((strip) => `${strip.label}, ${strip.items.length === 0 ? 'empty' : counted(strip.items.length, 'item')}`).join('; ');
}

export interface StripsPanelProps {
  readonly frame: Frame;
  readonly animate: boolean;
  readonly durationMs: number;
}

function StripsPanelImpl({ frame, animate, durationMs }: StripsPanelProps): ReactNode {
  const strips = stripsOf(frame);
  const ink = useInk();
  const roles = useMemo(() => resolveRoles(frame.highlights), [frame.highlights]);
  if (strips.length === 0) return null;

  const ms = Math.min(220, Math.max(60, durationMs * 0.6));
  const height = stripsHeight(strips.length);
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="xMinYMin meet"
      className="block h-auto w-full select-none"
      // Never drawn larger than a view unit to a pixel: a wide window would otherwise blow the chips up past the canvas's own scale.
      style={{ aspectRatio: `${VIEW_W} / ${height}`, maxWidth: `${VIEW_W}px` }}
      role="img"
      aria-label={describe(strips)}
    >
      {strips.map((strip, row) => (
        <StripRow
          key={strip.label}
          strip={strip}
          y={TOP + row * STRIP_HEIGHT}
          roles={roles}
          transition={animate ? `transform ${ms}ms var(--ease-slide)` : 'none'}
          animate={animate}
          ink={ink}
        />
      ))}
    </svg>
  );
}

export const StripsPanel = memo(StripsPanelImpl);
