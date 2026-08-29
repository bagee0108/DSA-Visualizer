/**
 * Tree renderer. Layout is deliberate pedagogy, not just tidiness: binary
 * trees put every node at x = its in-order rank. The bound is derived by the
 * caller from the frame array and passed in as a prop; it is never written
 * into a frame, because frames are frozen the moment they are yielded and the
 * bound is only known once the run ends.
 */

import { memo, useMemo, type ReactNode } from 'react';

import type { Frame, Highlights, Pointers, TreeNodeSnapshot, TreeSnapshot } from '../core/types';
import type { FillName, InkMap } from './ink';
import { ROLE_COLOR, resolveRoles } from './roles';
import { PAD_X, STRIP_HEIGHT, StripRow, VIEW_W } from './strips';

const VIEW_H = 400;
const TREE_TOP = 28;
const MAX_SLOT = 88;
const MAX_LEVEL_HEIGHT = 66;
const BADGE_MIN_SLOT = 36;

export interface TreeRunBound {
  readonly columns: number;
  readonly depth: number;
  readonly strips: number;
}

export interface TreeRendererProps {
  readonly snapshot: TreeSnapshot;
  readonly bound: TreeRunBound;
  readonly ink: InkMap;
  readonly highlights: Highlights;
  readonly pointers: Pointers;
  readonly animate: boolean;
  readonly durationMs: number;
}

interface Placed {
  readonly x: number;
  readonly y: number;
}

interface Measure {
  readonly columns: number;
  readonly depth: number;
}

function measureTree(snapshot: TreeSnapshot): Measure {
  const byId = new Map<string, TreeNodeSnapshot>();
  for (const node of snapshot.nodes) byId.set(node.id, node);
  if (snapshot.rootId === null || !byId.has(snapshot.rootId)) return { columns: 0, depth: 0 };

  let depth = 0;
  let columns = 0;
  const walk = (id: string, level: number): void => {
    const node = byId.get(id);
    if (node === undefined) return;
    if (level > depth) depth = level;
    const kids = node.children.filter((child): child is string => child !== null);
    if (snapshot.arity === 'binary' || kids.length === 0) columns += 1;
    for (const child of kids) walk(child, level + 1);
  };
  walk(snapshot.rootId, 0);
  return { columns, depth };
}

/**
 * Bound over a whole run. Consecutive frames that did not mutate the tree
 * share one frozen node array, so each distinct shape is measured once.
 */
export function treeRunBound(frames: readonly Frame[]): TreeRunBound {
  let columns = 1;
  let depth = 0;
  let strips = 0;
  const measured = new Set<readonly TreeNodeSnapshot[]>();
  for (const frame of frames) {
    if (frame.structure.kind !== 'tree') continue;
    if (frame.structure.strips.length > strips) strips = frame.structure.strips.length;
    if (measured.has(frame.structure.nodes)) continue;
    measured.add(frame.structure.nodes);
    const size = measureTree(frame.structure);
    if (size.columns > columns) columns = size.columns;
    if (size.depth > depth) depth = size.depth;
  }
  return { columns, depth, strips };
}

interface Scale {
  readonly slot: number;
  readonly levelHeight: number;
  readonly radius: number;
  readonly x0: number;
  readonly treeBottom: number;
}

function scaleFor(bound: TreeRunBound): Scale {
  const innerWidth = VIEW_W - PAD_X * 2;
  const treeBottom = VIEW_H - bound.strips * STRIP_HEIGHT - 10;
  const treeHeight = treeBottom - TREE_TOP;
  const columns = Math.max(1, bound.columns);
  const slot = Math.min(MAX_SLOT, innerWidth / columns);
  const levelHeight = bound.depth === 0 ? 0 : Math.min(MAX_LEVEL_HEIGHT, (treeHeight - 40) / bound.depth);
  const radius = Math.max(5, Math.min(17, slot * 0.42, bound.depth === 0 ? 17 : levelHeight * 0.4));
  return { slot, levelHeight, radius, x0: (VIEW_W - slot * columns) / 2, treeBottom };
}

function layoutTree(snapshot: TreeSnapshot, scale: Scale): ReadonlyMap<string, Placed> {
  const byId = new Map<string, TreeNodeSnapshot>();
  for (const node of snapshot.nodes) byId.set(node.id, node);

  const positions = new Map<string, Placed>();
  if (snapshot.rootId === null || !byId.has(snapshot.rootId)) return positions;

  // Column assignment: in-order rank for binary, leaf-span centre for n-ary.
  // These are two different systems on purpose; see CONTRIBUTING.md.
  const column = new Map<string, number>();
  const depthOf = new Map<string, number>();

  if (snapshot.arity === 'binary') {
    let rank = 0;
    const walk = (id: string, depth: number): void => {
      const node = byId.get(id);
      if (node === undefined) return;
      const left = node.children[0] ?? null;
      const right = node.children[1] ?? null;
      if (left !== null) walk(left, depth + 1);
      column.set(id, rank + 0.5);
      rank += 1;
      depthOf.set(id, depth);
      if (right !== null) walk(right, depth + 1);
    };
    walk(snapshot.rootId, 0);
  } else {
    const leaves = new Map<string, number>();
    const count = (id: string): number => {
      const node = byId.get(id);
      if (node === undefined) return 1;
      const kids = node.children.filter((child): child is string => child !== null);
      const total = kids.length === 0 ? 1 : kids.reduce((sum, child) => sum + count(child), 0);
      leaves.set(id, total);
      return total;
    };
    count(snapshot.rootId);
    const walk = (id: string, start: number, depth: number): void => {
      const node = byId.get(id);
      if (node === undefined) return;
      const span = leaves.get(id) ?? 1;
      column.set(id, start + span / 2);
      depthOf.set(id, depth);
      let cursor = start;
      for (const child of node.children) {
        if (child === null) continue;
        walk(child, cursor, depth + 1);
        cursor += leaves.get(child) ?? 1;
      }
    };
    walk(snapshot.rootId, 0, 0);
  }

  for (const [id, col] of column) {
    positions.set(id, {
      x: scale.x0 + col * scale.slot,
      y: TREE_TOP + scale.radius + 6 + (depthOf.get(id) ?? 0) * scale.levelHeight,
    });
  }
  return positions;
}

function pointerLabels(pointers: Pointers): ReadonlyMap<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [label, target] of Object.entries(pointers)) {
    if (typeof target !== 'string') continue;
    const bucket = out.get(target);
    if (bucket === undefined) out.set(target, [label]);
    else bucket.push(label);
  }
  return out;
}

function TreeRendererImpl({ snapshot, bound, ink, highlights, pointers, animate, durationMs }: TreeRendererProps): ReactNode {
  const scale = useMemo(() => scaleFor(bound), [bound]);
  const positions = useMemo(() => layoutTree(snapshot, scale), [snapshot, scale]);
  const roles = useMemo(() => resolveRoles(highlights), [highlights]);
  const labels = useMemo(() => pointerLabels(pointers), [pointers]);

  const moveMs = Math.min(220, Math.max(60, durationMs * 0.6));
  const slide = animate ? `transform ${moveMs}ms var(--ease-slide)` : 'none';
  const drop = animate ? `transform ${moveMs}ms var(--ease-drop)` : 'none';
  const mount = animate ? `viz-node-mount ${Math.min(320, moveMs + 120)}ms var(--ease-drop)` : 'none';
  const { radius, slot, treeBottom } = scale;
  const showText = radius >= 7;
  const allBadges = slot >= BADGE_MIN_SLOT;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full select-none"
      role="img"
      aria-label={`Tree of ${snapshot.nodes.length} nodes`}
    >
      {snapshot.rootId === null && (
        <text x={VIEW_W / 2} y={treeBottom / 2} textAnchor="middle" fontSize={13} fill="var(--viz-text-dim)">
          empty tree
        </text>
      )}

      {snapshot.nodes.map((node) => {
        if (node.parentId === null) return null;
        const child = positions.get(node.id);
        const parent = positions.get(node.parentId);
        if (child === undefined || parent === undefined) return null;
        const dx = child.x - parent.x;
        const dy = child.y - parent.y;
        const length = Math.hypot(dx, dy);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const role = roles.get(node.id);
        return (
          <g key={`edge-${node.id}`} style={{ transform: `translateX(${parent.x}px)`, transition: slide }}>
            <g
              style={{
                transform: `translateY(${parent.y}px) rotate(${angle}deg) scale(${length}, 1)`,
                transition: drop,
              }}
            >
              <line
                x1={0}
                y1={0}
                x2={1}
                y2={0}
                stroke={role === undefined ? 'var(--viz-grid)' : ROLE_COLOR[role]}
                strokeOpacity={role === undefined ? 1 : 0.7}
                strokeWidth={role === undefined ? 1.5 : 2.5}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          </g>
        );
      })}

      {snapshot.nodes.map((node) => {
        const placed = positions.get(node.id);
        if (placed === undefined) return null;
        const role = roles.get(node.id);
        const painted = node.color !== undefined;
        const fill = painted
          ? node.color === 'red'
            ? 'var(--viz-rb-red)'
            : 'var(--viz-rb-black)'
          : role === undefined
            ? 'var(--viz-default)'
            : ROLE_COLOR[role];
        const ring = painted && role !== undefined ? ROLE_COLOR[role] : null;
        const fillName: FillName = painted ? (node.color === 'red' ? 'rb-red' : 'rb-black') : (role ?? 'default');
        const tags = labels.get(node.id);
        const mentioned = role !== undefined || tags !== undefined;
        const badges = node.badges === undefined || !(allBadges || mentioned) ? null : Object.entries(node.badges);

        return (
          <g key={node.id} style={{ transform: `translateX(${placed.x}px)`, transition: slide }}>
            <g style={{ transform: `translateY(${placed.y}px)`, transition: drop }}>
              <g style={{ animation: mount, transformBox: 'fill-box', transformOrigin: 'center' }}>
                {ring !== null && <circle r={radius + 3.5} fill="none" stroke={ring} strokeWidth={3} />}
                <circle r={radius} fill={fill} />
                {node.terminal === true && (
                  <circle r={Math.max(2, radius - 3.5)} fill="none" stroke="var(--viz-bg)" strokeWidth={1.6} />
                )}
                {showText && (
                  <text
                    y={radius * 0.36}
                    textAnchor="middle"
                    fontSize={Math.min(12, radius * 0.95)}
                    fontWeight={600}
                    fill={ink[fillName]}
                    className="font-mono"
                  >
                    {node.label}
                  </text>
                )}
              </g>
              {badges !== null && badges.length > 0 && (
                <text
                  x={radius + 3}
                  y={-radius * 0.2}
                  fontSize={9}
                  fill="var(--viz-text-dim)"
                  className="font-mono"
                >
                  {badges.map(([key, value]) => `${key}${value}`).join(' ')}
                </text>
              )}
              {tags !== undefined && (
                <text
                  y={-radius - 5}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="var(--viz-active)"
                  className="font-mono"
                >
                  {tags.join(',')}
                </text>
              )}
            </g>
          </g>
        );
      })}

      {snapshot.strips.map((strip, row) => (
        <StripRow
          key={strip.label}
          strip={strip}
          y={treeBottom + 12 + row * STRIP_HEIGHT}
          roles={roles}
          transition={slide}
          animate={animate}
          ink={ink}
        />
      ))}
    </svg>
  );
}

export const TreeRenderer = memo(TreeRendererImpl);
