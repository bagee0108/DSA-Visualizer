/** Array renderer. */

import { memo, useMemo, type ReactNode } from 'react';

import type {
  ArrayRegion,
  ArraySnapshot,
  EntityId,
  Highlights,
  HighlightRole,
  Pointers,
  RegionTone,
} from '../core/types';
import type { InkMap } from './ink';
import { circleMark, markFor, rectMark } from './roles';

const VIEW_W = 1000;
const VIEW_H = 400;
const PAD_X = 10;
const INDEX_ROW_Y = 334;
const POINTER_ROW_Y = 352;
const POINTER_ROW_HEIGHT = 15;

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
  readonly ink: InkMap;
  readonly highlights: Highlights;
  readonly pointers: Pointers;
  readonly animate: boolean;
  readonly durationMs: number;
}

function resolveRoles(highlights: Highlights): ReadonlyMap<EntityId, HighlightRole> {
  const roles = new Map<EntityId, HighlightRole>();
  for (let p = ROLE_PRIORITY.length - 1; p >= 0; p--) {
    const role = ROLE_PRIORITY[p];
    if (role === undefined) continue;
    const ids = highlights[role];
    if (ids === undefined) continue;
    for (const id of ids) roles.set(id, role);
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
    if (typeof index !== 'number' || !Number.isFinite(index) || index < 0 || index >= size) continue;
    const bucket = byIndex.get(index);
    if (bucket === undefined) byIndex.set(index, [label]);
    else bucket.push(label);
  }
  return [...byIndex.entries()]
    .map(([index, labels]) => ({ index, labels }))
    .sort((a, b) => a.index - b.index);
}

interface Band {
  readonly top: number;
  readonly bottom: number;
}

function layoutFor(snapshot: ArraySnapshot): {
  chart: Band;
  tree: Band | null;
  aux: Band | null;
} {
  if (snapshot.heap !== undefined) {
    return { tree: { top: 14, bottom: 200 }, chart: { top: 228, bottom: 318 }, aux: null };
  }
  if (snapshot.auxiliary !== undefined) {
    return { tree: null, chart: { top: 26, bottom: 224 }, aux: { top: 250, bottom: 316 } };
  }
  return { tree: null, chart: { top: 30, bottom: 318 }, aux: null };
}

function ArrayRendererImpl({
  snapshot,
  ink,
  highlights,
  pointers,
  animate,
  durationMs,
}: ArrayRendererProps): ReactNode {
  const { elements, regions, auxiliary, heap } = snapshot;
  const size = elements.length;
  const bands = useMemo(() => layoutFor(snapshot), [snapshot]);

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

    const scaleTo = (band: Band) => {
      const height = band.bottom - band.top;
      return (value: number): number => band.bottom - ((value - domainLow) / span) * height;
    };

    const yOf = scaleTo(bands.chart);
    const auxYOf = bands.aux === null ? yOf : scaleTo(bands.aux);
    const xOf = (index: number): number => PAD_X + index * slot;

    return {
      slot,
      barWidth,
      xOf,
      yOf,
      auxYOf,
      baseline: yOf(0),
      auxBaseline: auxYOf(0),
    };
  }, [bands, elements, size]);

  const roles = useMemo(() => resolveRoles(highlights), [highlights]);
  const pointerGroups = useMemo(() => groupPointers(pointers, size), [pointers, size]);
  const auxPointerGroups = useMemo(
    () => (auxiliary === undefined ? [] : groupPointers(auxiliary.pointers, size)),
    [auxiliary, size],
  );

  const showValues = geometry.slot >= 26;
  const showIndices = geometry.slot >= 20;
  const transition = animate
    ? `transform ${Math.min(160, Math.max(40, durationMs * 0.7))}ms var(--ease-swap)`
    : 'none';

  const drawBar = (
    index: number,
    id: number,
    value: number,
    yOf: (value: number) => number,
    baseline: number,
    role: HighlightRole | undefined,
    keyPrefix: string,
    labelled: boolean,
  ): ReactNode => {
    const fill = role === undefined ? 'var(--viz-default)' : ROLE_COLOR[role];
    const y = yOf(value);
    const top = Math.min(y, baseline);
    const height = Math.max(1.5, Math.abs(y - baseline));
    const mark = markFor(role);
    const stroke = mark === null ? null : rectMark(mark, geometry.barWidth, height);
    const x = geometry.xOf(index) + (geometry.slot - geometry.barWidth) / 2;

    return (
      <g key={`${keyPrefix}${id}`} style={{ transform: `translate(${x}px, 0px)`, transition }}>
        <rect
          x={0}
          y={top}
          width={geometry.barWidth}
          height={height}
          rx={Math.min(3, geometry.barWidth / 3)}
          fill={fill}
        />
        {stroke !== null && (
          <rect
            x={stroke.width / 2}
            y={top + stroke.width / 2}
            width={geometry.barWidth - stroke.width}
            height={height - stroke.width}
            rx={Math.min(2, geometry.barWidth / 4)}
            fill="none"
            stroke={ink[role ?? 'default']}
            strokeWidth={stroke.width}
            strokeDasharray={stroke.dash}
          />
        )}
        {labelled && showValues && (
          <text
            x={geometry.barWidth / 2}
            y={value < 0 ? top + height + 12 : top - 5}
            textAnchor="middle"
            fontSize={11}
            fill={role === undefined ? 'var(--viz-text-dim)' : fill}
            className="font-mono"
          >
            {value}
          </text>
        )}
      </g>
    );
  };

  const drawPointerGroups = (groups: readonly PointerGroup[], rowY: number): ReactNode =>
    groups.map((group) => {
      const cx = geometry.xOf(group.index) + geometry.slot / 2;
      return (
        <g key={`ptr-${rowY}-${group.index}`} style={{ transform: `translate(${cx}px, 0px)`, transition }}>
          <path d={`M -5 ${rowY - 8} L 5 ${rowY - 8} L 0 ${rowY - 1} Z`} fill="var(--viz-active)" />
          {group.labels.map((label, row) => (
            <text
              key={label}
              x={0}
              y={rowY + 9 + row * POINTER_ROW_HEIGHT}
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
    });

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
              y={bands.chart.top - 18}
              width={width}
              height={bands.chart.bottom - bands.chart.top + 18}
              fill={REGION_FILL[region.tone]}
              rx={4}
            />
            <text
              x={x + 5}
              y={bands.chart.top - 6}
              fontSize={11}
              fill="var(--viz-text-dim)"
              className="font-mono"
            >
              {width > region.label.length * 6.2 ? region.label : ''}
            </text>
          </g>
        );
      })}

      {heap !== undefined && bands.tree !== null && (
        <HeapTree
          elements={elements}
          size={heap.size}
          roles={roles}
          band={bands.tree}
          transition={transition}
          ink={ink}
        />
      )}

      {geometry.baseline < bands.chart.bottom - 0.5 && (
        <line
          x1={PAD_X}
          x2={VIEW_W - PAD_X}
          y1={geometry.baseline}
          y2={geometry.baseline}
          stroke="var(--viz-grid)"
          strokeWidth={1}
        />
      )}

      {elements.map((element, index) =>
        drawBar(
          index,
          element.id,
          element.value,
          geometry.yOf,
          geometry.baseline,
          roles.get(index),
          '',
          true,
        ),
      )}

      {auxiliary !== undefined && bands.aux !== null && (
        <>
          <line
            x1={PAD_X}
            x2={VIEW_W - PAD_X}
            y1={bands.aux.top - 14}
            y2={bands.aux.top - 14}
            stroke="var(--viz-grid)"
            strokeWidth={1}
            strokeDasharray="3 4"
          />
          <text
            x={PAD_X}
            y={bands.aux.top - 4}
            fontSize={11}
            fill="var(--viz-text-dim)"
            className="font-mono"
          >
            {auxiliary.label}
          </text>
          {auxiliary.elements.map((element, index) => {
            if (index < auxiliary.activeFrom || index > auxiliary.activeTo) return null;
            return drawBar(
              index,
              element.id,
              element.value,
              geometry.auxYOf,
              geometry.auxBaseline,
              roles.get(`aux:${index}`),
              'aux-',
              false,
            );
          })}
          {drawPointerGroups(auxPointerGroups, bands.aux.bottom + 16)}
        </>
      )}

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

      {auxiliary === undefined && drawPointerGroups(pointerGroups, POINTER_ROW_Y)}
      {auxiliary !== undefined && drawPointerGroups(pointerGroups, INDEX_ROW_Y + 16)}
    </svg>
  );
}

interface HeapTreeProps {
  readonly elements: readonly { id: number; value: number }[];
  readonly size: number;
  readonly roles: ReadonlyMap<EntityId, HighlightRole>;
  readonly band: Band;
  readonly transition: string;
  readonly ink: InkMap;
}

function HeapTree({ elements, size, roles, band, transition, ink }: HeapTreeProps): ReactNode {
  const count = Math.max(0, Math.min(size, elements.length));
  if (count === 0) return null;

  const levels = Math.floor(Math.log2(count)) + 1;
  const levelHeight = (band.bottom - band.top) / Math.max(1, levels - 1 || 1);
  const innerWidth = VIEW_W - PAD_X * 2;

  const centreOf = (index: number): { x: number; y: number; level: number } => {
    const level = Math.floor(Math.log2(index + 1));
    const firstOfLevel = 2 ** level - 1;
    const slots = 2 ** level;
    const position = index - firstOfLevel;
    return {
      x: PAD_X + ((position + 0.5) * innerWidth) / slots,
      y: levels === 1 ? band.top + (band.bottom - band.top) / 2 : band.top + level * levelHeight,
      level,
    };
  };

  const deepestSlots = 2 ** (levels - 1);
  const radius = Math.max(2.5, Math.min(15, innerWidth / deepestSlots / 2 - 1.5, levelHeight / 2 - 4));
  const showText = radius >= 9;

  return (
    <g>
      {Array.from({ length: count }, (_, index) => index)
        .filter((index) => index > 0)
        .map((index) => {
          const child = centreOf(index);
          const parent = centreOf((index - 1) >> 1);
          return (
            <line
              key={`edge-${index}`}
              x1={parent.x}
              y1={parent.y}
              x2={child.x}
              y2={child.y}
              stroke="var(--viz-grid)"
              strokeWidth={1.2}
            />
          );
        })}

      {Array.from({ length: count }, (_, index) => index).map((index) => {
        const element = elements[index];
        if (element === undefined) return null;
        const { x, y } = centreOf(index);
        const role = roles.get(index);
        const fill = role === undefined ? 'var(--viz-default)' : ROLE_COLOR[role];
        const mark = markFor(role);
        const stroke = mark === null ? null : circleMark(mark, radius);
        return (
          <g key={`node-${element.id}`} style={{ transition }}>
            <circle cx={x} cy={y} r={radius} fill={fill} />
            {stroke !== null && (
              <circle
                cx={x}
                cy={y}
                r={stroke.radius}
                fill="none"
                stroke={ink[role ?? 'default']}
                strokeWidth={stroke.width}
                strokeDasharray={stroke.dash}
              />
            )}
            {showText && (
              <text
                x={x}
                y={y + 3.5}
                textAnchor="middle"
                fontSize={Math.min(11, radius)}
                fill={ink[role ?? 'default']}
                fontWeight={600}
                className="font-mono"
              >
                {element.value}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

export const ArrayRenderer = memo(ArrayRendererImpl);
