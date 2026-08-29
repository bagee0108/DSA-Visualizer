/** Highlight roles mapped to palette variables, shared by every renderer. */

import type { EntityId, Highlights, HighlightRole } from '../core/types';

export const ROLE_COLOR: Record<HighlightRole, string> = {
  comparing: 'var(--viz-comparing)',
  swapped: 'var(--viz-swapped)',
  pivot: 'var(--viz-pivot)',
  candidate: 'var(--viz-candidate)',
  sorted: 'var(--viz-sorted)',
  visited: 'var(--viz-visited)',
  active: 'var(--viz-active)',
  excluded: 'var(--viz-excluded)',
};

const ROLE_PRIORITY: readonly HighlightRole[] = [
  'swapped',
  'comparing',
  'pivot',
  'candidate',
  'active',
  'sorted',
  'visited',
  'excluded',
];

export function resolveRoles(highlights: Highlights): ReadonlyMap<EntityId, HighlightRole> {
  const roles = new Map<EntityId, HighlightRole>();
  for (let p = ROLE_PRIORITY.length - 1; p >= 0; p--) {
    const role = ROLE_PRIORITY[p];
    if (role === undefined) continue;
    for (const id of highlights[role] ?? []) roles.set(id, role);
  }
  return roles;
}

/**
 * Colour is not allowed to be the only carrier of a role. `pivot` and
 * `swapped` each sit closest to a peer that shares the screen with them -
 * pivot/active and swapped/sorted - so each of those two pairs has exactly one
 * marked member and stays separable with the colour removed entirely.
 *
 * The mark is drawn *inside* the shape, in the label ink, so it costs no space
 * and needs no size threshold: a 150-node graph draws nodes at radius 6.5 and
 * a degenerate BST at radius 5, and both still carry it.
 */
export type RoleMark = 'solid' | 'dashed';

const MARKED: Partial<Record<HighlightRole, RoleMark>> = {
  pivot: 'solid',
  swapped: 'dashed',
};

export function markFor(role: HighlightRole | undefined): RoleMark | null {
  return role === undefined ? null : MARKED[role] ?? null;
}

export interface MarkStroke {
  readonly width: number;
  readonly radius: number;
  readonly dash: string | undefined;
}

/** Inset stroke for a circular node of this radius. */
export function circleMark(mark: RoleMark, radius: number): MarkStroke {
  const width = Math.max(0.9, Math.min(2.5, radius * 0.24));
  const inset = Math.max(0.6, radius - width / 2);
  return {
    width,
    radius: inset,
    dash: mark === 'dashed' ? `${Math.max(1.8, inset * 0.55)} ${Math.max(1.3, inset * 0.4)}` : undefined,
  };
}

/** Inset stroke for a rectangular chip or bar. */
export function rectMark(mark: RoleMark, width: number, height: number): MarkStroke | null {
  if (width < 6 || height < 6) return null;
  const stroke = Math.max(1, Math.min(1.8, Math.min(width, height) * 0.12));
  return { width: stroke, radius: stroke, dash: mark === 'dashed' ? '3 2.2' : undefined };
}
