/**
 * Tree renderer. Layout is deliberate pedagogy, not just tidiness: binary
 * trees put every node at x = its in-order rank.
 */

import { memo, useMemo, type ReactNode } from 'react';

import type {
  EntityId,
  Frame,
  Highlights,
  HighlightRole,
  Pointers,
  TreeNodeSnapshot,
  TreeSnapshot,
  TreeStrip,
} from '../core/types';

const VIEW_W = 1000;
const VIEW_H = 400;
const PAD_X = 16;
const TREE_TOP = 28;
const STRIP_HEIGHT = 46;

const ROLE_COLOR: Record<HighlightRole, string> = {
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

export interface TreeRendererProps {
  readonly snapshot: TreeSnapshot;
  readonly bound: TreeRunBound;
  readonly highlights: Highlights;
  readonly pointers: Pointers;
  readonly animate: boolean;
  readonly durationMs: number;
}

interface Placed {
  readonly x: number;
  readonly y: number;
}

export interface TreeRunBound {
  readonly columns: number;
  readonly depth: number;
  readonly strips: number;
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

function resolveRoles(highlights: Highlights): ReadonlyMap<EntityId, HighlightRole> {
  const roles = new Map<EntityId, HighlightRole>();
  for (let p = ROLE_PRIORITY.length - 1; p >= 0; p--) {
    const role = ROLE_PRIORITY[p];
    if (role === undefined) continue;
    for (const id of highlights[role] ?? []) roles.set(id, role);
  }
  return roles;
}

interface Layout {
  readonly positions: ReadonlyMap<string, Placed>;
  readonly radius: number;
}

function layoutTree(snapshot: TreeSnapshot, treeBottom: number): Layout {
  const byId = new Map<string, TreeNodeSnapshot>();
  for (const node of snapshot.nodes) byId.set(node.id, node);

  const positions = new Map<string, Placed>();
  if (snapshot.rootId === null || !byId.has(snapshot.rootId)) return { positions, radius: 12 };

  const innerWidth = VIEW_W - PAD_X * 2;
  const treeHeight = treeBottom - TREE_TOP;

  // Column assignment: in-order rank for binary, leaf-span centre for n-ary.
  const column = new Map<string, number>();
  const depthOf = new Map<string, number>();
  let maxDepth = 0;
  let columns = 0;

  if (snapshot.arity === 'binary') {
    const walk = (id: string, depth: number): void => {
      const node = byId.get(id);
      if (node === undefined) return;
      const left = node.children[0] ?? null;
      const right = node.children[1] ?? null;
      if (left !== null) walk(left, depth + 1);
      column.set(id, columns + 0.5);
      columns += 1;
      depthOf.set(id, depth);
      if (depth > maxDepth) maxDepth = depth;
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
    columns = count(snapshot.rootId);
    const walk = (id: string, start: number, depth: number): void => {
      const node = byId.get(id);
      if (node === undefined) return;
      const span = leaves.get(id) ?? 1;
      column.set(id, start + span / 2);
      depthOf.set(id, depth);
      if (depth > maxDepth) maxDepth = depth;
      let cursor = start;
      for (const child of node.children) {
        if (child === null) continue;
        walk(child, cursor, depth + 1);
        cursor += leaves.get(child) ?? 1;
      }
    };
    walk(snapshot.rootId, 0, 0);
  }

  const slot = Math.min(88, innerWidth / Math.max(1, columns));
  const usedWidth = slot * columns;
  const x0 = (VIEW_W - usedWidth) / 2;
  const levelHeight = maxDepth === 0 ? 0 : Math.min(66, (treeHeight - 40) / maxDepth);
  const radius = Math.max(5, Math.min(17, slot * 0.42, maxDepth === 0 ? 17 : levelHeight * 0.4));

  for (const [id, col] of column) {
    positions.set(id, {
      x: x0 + col * slot,
      y: TREE_TOP + radius + 6 + (depthOf.get(id) ?? 0) * levelHeight,
    });
  }
  return { positions, radius };
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

function TreeRendererImpl({ snapshot, highlights, pointers, animate, durationMs }: TreeRendererProps): ReactNode {
  const stripsHeight = snapshot.strips.length * STRIP_HEIGHT;
  const treeBottom = VIEW_H - stripsHeight - 10;

  const layout = useMemo(() => layoutTree(snapshot, treeBottom), [snapshot, treeBottom]);
  const roles = useMemo(() => resolveRoles(highlights), [highlights]);
  const labels = useMemo(() => pointerLabels(pointers), [pointers]);

  const transition = animate
    ? `transform ${Math.min(220, Math.max(60, durationMs * 0.6))}ms ease-out`
    : 'none';
  const { radius } = layout;
  const showText = radius >= 7;

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
        const child = layout.positions.get(node.id);
        const parent = layout.positions.get(node.parentId);
        if (child === undefined || parent === undefined) return null;
        const dx = child.x - parent.x;
        const dy = child.y - parent.y;
        const length = Math.hypot(dx, dy);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const role = roles.get(node.id);
        return (
          <g
            key={`edge-${node.id}`}
            style={{
              transform: `translate(${parent.x}px, ${parent.y}px) rotate(${angle}deg) scale(${length}, 1)`,
              transition,
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
        );
      })}

      {snapshot.nodes.map((node) => {
        const placed = layout.positions.get(node.id);
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
        const tags = labels.get(node.id);
        const badges = node.badges === undefined ? null : Object.entries(node.badges);

        return (
          <g key={node.id} style={{ transform: `translate(${placed.x}px, ${placed.y}px)`, transition }}>
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
                fill={painted || role !== undefined ? '#fff' : 'var(--viz-text)'}
                className="font-mono"
              >
                {node.label}
              </text>
            )}
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
        );
      })}

      {snapshot.strips.map((strip, row) => (
        <StripRow
          key={strip.label}
          strip={strip}
          y={treeBottom + 12 + row * STRIP_HEIGHT}
          roles={roles}
          transition={transition}
        />
      ))}
    </svg>
  );
}

interface StripRowProps {
  readonly strip: TreeStrip;
  readonly y: number;
  readonly roles: ReadonlyMap<EntityId, HighlightRole>;
  readonly transition: string;
}

function StripRow({ strip, y, roles, transition }: StripRowProps): ReactNode {
  const labelWidth = 92;
  const available = VIEW_W - PAD_X * 2 - labelWidth;
  const chip = Math.min(44, available / Math.max(1, strip.items.length));
  const chipW = chip - 4;
  const hint = strip.kind === 'queue' ? 'front -> back' : strip.kind === 'stack' ? 'bottom -> top' : 'in order';

  return (
    <g>
      <text x={PAD_X} y={y + 16} fontSize={11} fill="var(--viz-text-dim)" className="font-mono">
        {strip.label}
      </text>
      <text x={PAD_X} y={y + 29} fontSize={8.5} fill="var(--viz-text-dim)" opacity={0.7} className="font-mono">
        {hint}
      </text>
      {strip.items.length === 0 && (
        <text x={PAD_X + labelWidth} y={y + 20} fontSize={10} fill="var(--viz-text-dim)" opacity={0.6}>
          empty
        </text>
      )}
      {strip.items.map((item, index) => {
        const x = PAD_X + labelWidth + index * chip;
        const role = roles.get(`${strip.kind}:${item.id}`) ?? roles.get(item.id);
        const fill = role === undefined ? 'var(--viz-excluded)' : ROLE_COLOR[role];
        return (
          <g key={`${strip.kind}-${item.id}`} style={{ transform: `translate(${x}px, ${y}px)`, transition }}>
            <rect width={chipW} height={28} rx={5} fill={fill} opacity={role === undefined ? 0.7 : 1} />
            <text
              x={chipW / 2}
              y={18}
              textAnchor="middle"
              fontSize={11}
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

export const TreeRenderer = memo(TreeRendererImpl);
