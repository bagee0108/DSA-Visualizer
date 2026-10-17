/** Array renderer. */

import { memo, useMemo, type ReactNode } from 'react';

import type {
  ArrayElement,
  ArrayRegion,
  ArraySnapshot,
  EntityId,
  Highlights,
  HighlightRole,
  Pointers,
  RegionTone,
} from '../core/types';
import { counted, VIEW_H, VIEW_W } from './canvas';
import type { InkMap } from './ink';
import { circleMark, markFor, rectMark } from './roles';

const PAD_X = 10;
/** Index row, pointer row and up to three stacked pointer labels live below the chart. */
const BOTTOM_FURNITURE = 82;
/** Every band grows with the viewBox and stops here; nothing below is scaled. */
export const FLOOR = VIEW_H - BOTTOM_FURNITURE;
export const INDEX_ROW_Y = FLOOR + 16;
export const POINTER_ROW_Y = INDEX_ROW_Y + 18;
export const POINTER_ROW_HEIGHT = 15;
const CHART_TOP = 30;
const AUX_TOP = 26;
const AUX_GAP = 26;
const HEAP_TOP = 14;
const HEAP_GAP = 28;

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

export type BandLayout = {
  chart: Band;
  tree: Band | null;
  aux: Band | null;
};

export type BandVariant = 'plain' | 'heap' | 'aux';

/** Bands are a share of the height down to FLOOR, so a taller viewBox is spent on the drawing. */
export function arrayBands(variant: BandVariant): BandLayout {
  if (variant === 'heap') {
    const body = FLOOR - HEAP_TOP - HEAP_GAP;
    const treeBottom = HEAP_TOP + (body * 2) / 3;
    return { tree: { top: HEAP_TOP, bottom: treeBottom }, chart: { top: treeBottom + HEAP_GAP, bottom: FLOOR }, aux: null };
  }
  if (variant === 'aux') {
    const floor = FLOOR - 2;
    const body = floor - AUX_TOP - AUX_GAP;
    return {
      tree: null,
      chart: { top: AUX_TOP, bottom: AUX_TOP + body * 0.75 },
      aux: { top: floor - body * 0.25, bottom: floor },
    };
  }
  return { tree: null, chart: { top: CHART_TOP, bottom: FLOOR }, aux: null };
}

function variantOf(snapshot: ArraySnapshot): BandVariant {
  if (snapshot.heap !== undefined) return 'heap';
  if (snapshot.auxiliary !== undefined) return 'aux';
  return 'plain';
}

/** The largest letter tile; past it more room becomes space between tiles. */
export const TILE_MAX = 56;
/** Between a text row and the pattern under it: the aux label and its rule. */
export const LETTER_ROW_GAP = 30;
/** Above a text row and below a pattern row: three stacked pointer labels. */
export const LETTER_POINTER_ROOM = 54;

export interface LetterTiles {
  readonly size: number;
  /** Top of the main row's tiles. */
  readonly mainY: number;
  /** Top of the aux row's tiles; equal to mainY when there is no aux row. */
  readonly auxY: number;
}

/**
 * Letters are tiles of one size, not bars. A lone row sits in the middle of
 * its band. With an aux row the two are one picture - a pattern directly
 * under the text it is matched against - centred in the space both bands
 * share, with room above the text and below the pattern for their pointers.
 */
export function letterTiles(variant: BandVariant, slot: number): LetterTiles {
  const bands = arrayBands(variant);
  if (bands.aux === null) {
    const chart = bands.chart.bottom - bands.chart.top;
    const size = Math.max(4, Math.min(TILE_MAX, slot * 0.86, chart));
    const mainY = bands.chart.top + (chart - size) / 2;
    return { size, mainY, auxY: mainY };
  }
  const span = bands.aux.bottom - bands.chart.top;
  const size = Math.max(4, Math.min(TILE_MAX, slot * 0.86, (span - LETTER_ROW_GAP - 2 * LETTER_POINTER_ROOM) / 2));
  const mainY = bands.chart.top + (span - 2 * size - LETTER_ROW_GAP) / 2;
  return { size, mainY, auxY: mainY + size + LETTER_ROW_GAP };
}

/** Below this tile size a corner note would be unreadable, so it is left out. */
export const NOTE_MIN_TILE = 24;

/** A tile's corner note, small enough to clear the centred letter. */
export function noteFont(tile: number): number {
  return Math.min(12, Math.max(8, tile * 0.24));
}

function isLetters(elements: readonly ArrayElement[]): boolean {
  return elements.length > 0 && typeof elements[0]?.value === 'string';
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
  const variant = variantOf(snapshot);
  const bands = useMemo(() => arrayBands(variant), [variant]);
  const letters = isLetters(elements);

  const geometry = useMemo(() => {
    const innerWidth = VIEW_W - PAD_X * 2;
    const slot = size > 0 ? innerWidth / size : innerWidth;
    const barWidth = Math.max(1.5, slot * 0.78);

    let min = Infinity;
    let max = -Infinity;
    for (const { value } of elements) {
      if (typeof value !== 'number') continue;
      if (value < min) min = value;
      if (value > max) max = value;
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
      tiles: letterTiles(variant, slot),
    };
  }, [bands, elements, size, variant]);

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

  const drawTile = (
    index: number,
    id: number,
    value: string,
    y: number,
    role: HighlightRole | undefined,
    keyPrefix: string,
    note: string | undefined,
  ): ReactNode => {
    const tile = geometry.tiles.size;
    const fill = role === undefined ? 'var(--viz-default)' : ROLE_COLOR[role];
    const mark = markFor(role);
    const stroke = mark === null ? null : rectMark(mark, tile, tile);
    const x = geometry.xOf(index) + (geometry.slot - tile) / 2;
    const font = Math.min(22, tile * 0.5, (tile - 6) / (Math.max(1, value.length) * 0.6));
    return (
      <g key={`${keyPrefix}${id}`} style={{ transform: `translate(${x}px, 0px)`, transition }}>
        <rect x={0} y={y} width={tile} height={tile} rx={Math.min(4, tile / 5)} fill={fill} />
        {stroke !== null && (
          <rect
            x={stroke.width / 2}
            y={y + stroke.width / 2}
            width={tile - stroke.width}
            height={tile - stroke.width}
            rx={stroke.radius}
            fill="none"
            stroke={ink[role ?? 'default']}
            strokeWidth={stroke.width}
            strokeDasharray={stroke.dash}
          />
        )}
        {font >= 6 && (
          <text
            x={tile / 2}
            y={y + tile / 2 + font * 0.36}
            textAnchor="middle"
            fontSize={font}
            fontWeight={600}
            fill={ink[role ?? 'default']}
            className="font-mono"
          >
            {value}
          </text>
        )}
        {note !== undefined && tile >= NOTE_MIN_TILE && (
          <text
            x={tile - 3}
            y={y + tile - 3}
            textAnchor="end"
            fontSize={noteFont(tile)}
            fill={ink[role ?? 'default']}
            opacity={0.8}
            className="font-mono"
          >
            {note}
          </text>
        )}
      </g>
    );
  };

  /** Pointers over a row of tiles, labels stacking upward, each marker pointing down at its tile. */
  const drawPointersAbove = (groups: readonly PointerGroup[], tileTop: number): ReactNode =>
    groups.map((group) => {
      const cx = geometry.xOf(group.index) + geometry.slot / 2;
      return (
        <g key={`ptr-above-${group.index}`} style={{ transform: `translate(${cx}px, 0px)`, transition }}>
          <path d={`M -5 ${tileTop - 9} L 5 ${tileTop - 9} L 0 ${tileTop - 2} Z`} fill="var(--viz-active)" />
          {group.labels.map((label, row) => (
            <text
              key={label}
              x={0}
              y={tileTop - 13 - row * POINTER_ROW_HEIGHT}
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
      aria-label={`Array of ${counted(size, 'element')}`}
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

      {!letters && geometry.baseline < bands.chart.bottom - 0.5 && (
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
        typeof element.value === 'string'
          ? drawTile(index, element.id, element.value, geometry.tiles.mainY, roles.get(index), '', element.note)
          : drawBar(index, element.id, element.value, geometry.yOf, geometry.baseline, roles.get(index), '', true),
      )}

      {auxiliary !== undefined && bands.aux !== null && (
        <>
          <line
            x1={PAD_X}
            x2={VIEW_W - PAD_X}
            y1={letters ? geometry.tiles.auxY - LETTER_ROW_GAP + 8 : bands.aux.top - 14}
            y2={letters ? geometry.tiles.auxY - LETTER_ROW_GAP + 8 : bands.aux.top - 14}
            stroke="var(--viz-grid)"
            strokeWidth={1}
            strokeDasharray="3 4"
          />
          <text
            x={PAD_X}
            y={letters ? geometry.tiles.auxY - 6 : bands.aux.top - 4}
            fontSize={11}
            fill="var(--viz-text-dim)"
            className="font-mono"
          >
            {auxiliary.label}
          </text>
          {auxiliary.elements.map((element, index) => {
            if (index < auxiliary.activeFrom || index > auxiliary.activeTo) return null;
            const role = roles.get(`aux:${index}`);
            return typeof element.value === 'string'
              ? drawTile(index, element.id, element.value, geometry.tiles.auxY, role, 'aux-', element.note)
              : drawBar(index, element.id, element.value, geometry.auxYOf, geometry.auxBaseline, role, 'aux-', false);
          })}
          {drawPointerGroups(auxPointerGroups, letters ? geometry.tiles.auxY + geometry.tiles.size + 12 : bands.aux.bottom + 16)}
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

      {letters && auxiliary !== undefined && drawPointersAbove(pointerGroups, geometry.tiles.mainY)}
      {letters && auxiliary === undefined && drawPointerGroups(pointerGroups, geometry.tiles.mainY + geometry.tiles.size + 12)}
      {!letters && auxiliary === undefined && drawPointerGroups(pointerGroups, POINTER_ROW_Y)}
      {!letters && auxiliary !== undefined && drawPointerGroups(pointerGroups, INDEX_ROW_Y + 16)}
    </svg>
  );
}

interface HeapTreeProps {
  readonly elements: readonly ArrayElement[];
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
