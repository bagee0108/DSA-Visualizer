/** Array renderer. */

import { memo, useMemo, type ReactNode } from 'react';

import type {
  ArrayRegion,
  ArraySnapshot,
  Highlights,
  HighlightRole,
  Pointers,
  RegionTone,
} from '../core/types';

const VIEW_W = 1000;
const VIEW_H = 400;
const PAD_X = 10;
const CHART_TOP = 30;
const CHART_BOTTOM = 318;
const INDEX_ROW_Y = 334;
const POINTER_ROW_Y = 352;
const POINTER_ROW_HEIGHT = 15;

const ROLE_COLOR: Record<HighlightRole, string> = {
  comparing: 'var(--viz-comparing)',
  swapped: 'var(--viz-swapped)',
  pivot: 'var(--viz-pivot)',
  candidate: 'var(--viz-candidate)',
  sorted: 'var(--viz-sorted)',
  visited: 'var(--viz-excluded)',
  active: 'var(--viz-active)',
  excluded: 'var(--viz-excluded)',
};

const ROLE_PRIORITY: readonly HighlightRole[] = [
  'swapped',
  'comparing',
  'pivot',
  'candidate',
  'sorted',
  'visited',
  'active',
  'excluded',
];

const REGION_FILL: Record<RegionTone, string> = {
  active: 'var(--viz-region-active)',
  sorted: 'var(--viz-region-sorted)',
  excluded: 'var(--viz-region-excluded)',
  left: 'var(--viz-region-left)',
  right: 'var(--viz-region-right)',
};

export interface ArrayRendererProps {
  readonly snapshot: ArraySnapshot;
  readonly highlights: Highlights;
  readonly pointers: Pointers;
  readonly animate: boolean;
  readonly durationMs: number;
}

function resolveRoles(highlights: Highlights, size: number): ReadonlyMap<number, HighlightRole> {
  const roles = new Map<number, HighlightRole>();
  for (let p = ROLE_PRIORITY.length - 1; p >= 0; p--) {
    const role = ROLE_PRIORITY[p];
    if (role === undefined) continue;
    const ids = highlights[role];
    if (ids === undefined) continue;
    for (const id of ids) {
      if (typeof id !== 'number') continue;
      if (id < 0 || id >= size) continue;
      roles.set(id, role);
    }
  }
  return roles;
}

interface PointerGroup {
  readonly index: number;
  readonly labels: readonly string[];
}

function groupPointers(pointers: Pointers, size: number): readonly PointerGroup[] {
  const byIndex = new Map<number, string[]>();
  for (const [label, index] of Object.entries(pointers)) {
    if (!Number.isFinite(index) || index < 0 || index >= size) continue;
    const bucket = byIndex.get(index);
    if (bucket === undefined) byIndex.set(index, [label]);
    else bucket.push(label);
  }
  return [...byIndex.entries()]
    .map(([index, labels]) => ({ index, labels }))
    .sort((a, b) => a.index - b.index);
}

function ArrayRendererImpl({
  snapshot,
  highlights,
  pointers,
  animate,
  durationMs,
}: ArrayRendererProps): ReactNode {
  const { elements, regions } = snapshot;
  const size = elements.length;

  const geometry = useMemo(() => {
    const innerWidth = VIEW_W - PAD_X * 2;
    const slot = size > 0 ? innerWidth / size : innerWidth;
    const barWidth = Math.max(1.5, slot * 0.78);

    let min = Infinity;
    let max = -Infinity;
    for (const element of elements) {
      if (element.value < min) min = element.value;
      if (element.value > max) max = element.value;
    }
    if (!Number.isFinite(min)) {
      min = 0;
      max = 1;
    }

    const domainLow = Math.min(0, min);
    const domainHigh = Math.max(max, domainLow + 1e-9);
    const span = domainHigh - domainLow || 1;
    const height = CHART_BOTTOM - CHART_TOP;

    const yOf = (value: number): number => CHART_BOTTOM - ((value - domainLow) / span) * height;
    const xOf = (index: number): number => PAD_X + index * slot;

    return { slot, barWidth, yOf, xOf, baseline: yOf(0) };
  }, [elements, size]);

  const roles = useMemo(() => resolveRoles(highlights, size), [highlights, size]);
  const pointerGroups = useMemo(() => groupPointers(pointers, size), [pointers, size]);

  const showValues = geometry.slot >= 26;
  const showIndices = geometry.slot >= 20;
  const transition = animate ? `transform ${Math.min(160, Math.max(40, durationMs * 0.7))}ms linear` : 'none';

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full select-none"
      role="img"
      aria-label={`Array of ${size} elements`}
    >
      {regions.map((region: ArrayRegion, position) => {
        const from = Math.max(0, Math.min(size - 1, region.from));
        const to = Math.max(from, Math.min(size - 1, region.to));
        const x = geometry.xOf(from);
        const width = geometry.xOf(to) + geometry.slot - x;
        return (
          <g key={`${region.label}-${position}`}>
            <rect
              x={x}
              y={CHART_TOP - 18}
              width={width}
              height={CHART_BOTTOM - CHART_TOP + 18}
              fill={REGION_FILL[region.tone]}
              rx={4}
            />
            <text
              x={x + 5}
              y={CHART_TOP - 6}
              fontSize={11}
              fill="var(--viz-text-dim)"
              className="font-mono"
            >
              {width > region.label.length * 6.2 ? region.label : ''}
            </text>
          </g>
        );
      })}

      {geometry.baseline < CHART_BOTTOM - 0.5 && (
        <line
          x1={PAD_X}
          x2={VIEW_W - PAD_X}
          y1={geometry.baseline}
          y2={geometry.baseline}
          stroke="var(--viz-grid)"
          strokeWidth={1}
        />
      )}

      {elements.map((element, index) => {
        const role = roles.get(index);
        const fill = role === undefined ? 'var(--viz-default)' : ROLE_COLOR[role];
        const y = geometry.yOf(element.value);
        const top = Math.min(y, geometry.baseline);
        const height = Math.max(1.5, Math.abs(y - geometry.baseline));
        const x = geometry.xOf(index) + (geometry.slot - geometry.barWidth) / 2;
        const isNegative = element.value < 0;

        return (
          <g key={element.id} style={{ transform: `translate(${x}px, 0px)`, transition }}>
            <rect
              x={0}
              y={top}
              width={geometry.barWidth}
              height={height}
              rx={Math.min(3, geometry.barWidth / 3)}
              fill={fill}
            />
            {showValues && (
              <text
                x={geometry.barWidth / 2}
                y={isNegative ? top + height + 12 : top - 5}
                textAnchor="middle"
                fontSize={11}
                fill={role === undefined ? 'var(--viz-text-dim)' : fill}
                className="font-mono"
              >
                {element.value}
              </text>
            )}
          </g>
        );
      })}

      {showIndices &&
        elements.map((element, index) => (
          <text
            key={`idx-${element.id}`}
            x={geometry.xOf(index) + geometry.slot / 2}
            y={INDEX_ROW_Y}
            textAnchor="middle"
            fontSize={10}
            fill="var(--viz-text-dim)"
            className="font-mono"
          >
            {index}
          </text>
        ))}

      {pointerGroups.map((group) => {
        const cx = geometry.xOf(group.index) + geometry.slot / 2;
        return (
          <g
            key={`ptr-${group.index}`}
            style={{ transform: `translate(${cx}px, 0px)`, transition }}
          >
            <path
              d={`M -5 ${POINTER_ROW_Y - 8} L 5 ${POINTER_ROW_Y - 8} L 0 ${POINTER_ROW_Y - 1} Z`}
              fill="var(--viz-active)"
            />
            {group.labels.map((label, row) => (
              <text
                key={label}
                x={0}
                y={POINTER_ROW_Y + 9 + row * POINTER_ROW_HEIGHT}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill="var(--viz-active)"
                className="font-mono"
              >
                {label}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export const ArrayRenderer = memo(ArrayRendererImpl);
