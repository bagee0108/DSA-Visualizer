/**
 * Matrix renderer: a DP table, or several stacked in a split frame. Shapes,
 * headers and titles are fixed for the run, so the layout is computed once per
 * run and a frame only refills cells, recolours and redraws the current cell's
 * dependency arrows.
 */

import { memo, useMemo, type ReactNode } from 'react';

import { parseMatrixRef } from '../core/matrixScene';
import type { EntityId, Highlights, HighlightRole, MatrixArrow, MatrixSnapshot, Pointers, SplitSnapshot, Strip } from '../core/types';
import { counted, VIEW_H, VIEW_W } from './canvas';
import type { FillName, InkMap } from './ink';
import { markFor, rectMark, ROLE_COLOR, resolveRoles } from './roles';
import { PAD_X, STRIP_HEIGHT, StripRow } from './strips';

export const MATRIX_TOP = 10;
/** Column title, then column pointers, then column headers, then the grid. */
export const TITLE_H = 18;
export const POINTER_H = 20;
export const HEADER_H = 20;
/** A split frame names each pane on a line of its own, and spaces the panes apart. */
export const PANE_TITLE_H = 16;
export const PANE_GAP = 12;
/** The band kept under a table that draws long bottom-row jumps beneath it: the dip, then the label. */
export const UNDER_H = 28;
const UNDER_DIP = 9;
/** Row pointers sit left of the row headers; labels are short names such as i or j. */
export const ROW_POINTER_W = 40;
export const MAX_CELL = 56;
const GAP = 3;
/** Mono glyphs run about 0.6 em wide. */
const CHAR_W = 0.6;
/** Smallest arrow label worth printing inside its source cell. */
const MIN_TAG_FONT = 7;

export interface PaneShape {
  readonly rows: number;
  readonly cols: number;
  readonly rowHeaders: readonly string[];
  readonly rowTitle: string;
  readonly arrowsUnder?: boolean;
}

export interface MatrixShape extends PaneShape {
  readonly strips: number;
}

/** Where one table sits: the top-left of its grid and the lines above it. */
export interface PanePlace {
  readonly y0: number;
  readonly paneTitleY: number;
  readonly titleY: number;
  readonly pointerY: number;
  readonly headerY: number;
}

export interface StackLayout {
  /** One cell size and one left edge for every pane, so their columns line up. */
  readonly cell: number;
  readonly x0: number;
  readonly headerW: number;
  /** The width of the gutters left of the grids. */
  readonly left: number;
  readonly panes: readonly PanePlace[];
  /** Where the band above the strips ends. */
  readonly bottom: number;
}

export interface MatrixLayout extends PanePlace {
  readonly cell: number;
  readonly x0: number;
  readonly headerW: number;
  readonly bottom: number;
}

export function matrixBandBottom(strips: number): number {
  return VIEW_H - strips * STRIP_HEIGHT - 10;
}

function longest(labels: readonly string[]): number {
  return labels.reduce((max, label) => Math.max(max, label.length), 1);
}

/**
 * The biggest square cell that fits every pane both ways, with the lines for
 * titles, pointers and headers taken out first. Tables and gutters are centred
 * as one piece, so a small table sits in the middle rather than hugging the
 * left, and the panes share one left edge.
 */
export function matrixStackLayout(shapes: readonly PaneShape[], strips: number, titled: boolean): StackLayout {
  const bottom = matrixBandBottom(strips);
  const headerW = Math.max(22, ...shapes.map((shape) => longest(shape.rowHeaders) * 12 * CHAR_W + 12));
  // The row title sits in the corner and must not run off the left edge.
  const titleW = Math.max(...shapes.map((shape) => (shape.rowTitle.length + 2) * 10 * CHAR_W + 8));
  const left = Math.max(ROW_POINTER_W + headerW, titleW);
  const lines = TITLE_H + POINTER_H + HEADER_H + (titled ? PANE_TITLE_H : 0);

  const cols = Math.max(...shapes.map((shape) => shape.cols));
  const rows = shapes.reduce((sum, shape) => sum + shape.rows, 0);
  const under = shapes.reduce((sum, shape) => sum + (shape.arrowsUnder === true ? UNDER_H : 0), 0);
  const availW = VIEW_W - PAD_X * 2 - left;
  const availH = bottom - MATRIX_TOP - shapes.length * lines - (shapes.length - 1) * PANE_GAP - under;
  const cell = Math.min(MAX_CELL, availW / cols, availH / rows);

  const x0 = (VIEW_W - (left + cell * cols)) / 2 + left;
  let top = MATRIX_TOP + (availH - cell * rows) / 2;
  const panes = shapes.map((shape) => {
    const paneTitleY = top + PANE_TITLE_H / 2;
    const titleY = top + (titled ? PANE_TITLE_H : 0) + TITLE_H / 2;
    const y0 = top + lines;
    top = y0 + shape.rows * cell + (shape.arrowsUnder === true ? UNDER_H : 0) + PANE_GAP;
    return { y0, paneTitleY, titleY, pointerY: y0 - HEADER_H - POINTER_H, headerY: y0 - HEADER_H };
  });
  return { cell, x0, headerW, left, panes, bottom };
}

/** A single table: a stack of one, with no pane title. */
export function matrixLayout(shape: MatrixShape): MatrixLayout {
  const stack = matrixStackLayout([shape], shape.strips, false);
  const place = stack.panes[0] ?? { y0: 0, paneTitleY: 0, titleY: 0, pointerY: 0, headerY: 0 };
  return { ...place, cell: stack.cell, x0: stack.x0, headerW: stack.headerW, bottom: stack.bottom };
}

/** Font size for a label that has to fit a box this wide. */
function fitFont(text: string, width: number, max: number): number {
  return Math.min(max, (width - 4) / (Math.max(1, text.length) * CHAR_W));
}

interface PointerTags {
  readonly rows: ReadonlyMap<number, string[]>;
  readonly cols: ReadonlyMap<number, string[]>;
  readonly cells: ReadonlyMap<string, string[]>;
}

/** Pointers into this table: those whose target starts with its prefix ("" for a lone table). */
function pointerTags(pointers: Pointers, prefix: string, rows: number, cols: number): PointerTags {
  const out = { rows: new Map<number, string[]>(), cols: new Map<number, string[]>(), cells: new Map<string, string[]>() };
  const add = <K,>(map: Map<K, string[]>, key: K, label: string): void => {
    const bucket = map.get(key);
    if (bucket === undefined) map.set(key, [label]);
    else bucket.push(label);
  };
  for (const [label, target] of Object.entries(pointers)) {
    if (typeof target !== 'string' || !target.startsWith(prefix)) continue;
    const local = target.slice(prefix.length);
    const ref = parseMatrixRef(local);
    if (ref === null) continue;
    if (ref.kind === 'row' && ref.index < rows) add(out.rows, ref.index, label);
    else if (ref.kind === 'col' && ref.index < cols) add(out.cols, ref.index, label);
    else if (ref.kind === 'cell' && ref.row < rows && ref.col < cols) add(out.cells, local, label);
  }
  return out;
}

function arrowKey(arrow: MatrixArrow): string {
  return `${arrow.from.row}:${arrow.from.col}>${arrow.to.row}:${arrow.to.col}`;
}

/**
 * An arrow's label goes inside the cell it comes from: the arrows into one
 * cell all meet at it, so labels along them would pile up, while their
 * sources are always distinct cells. The label takes the half of the cell the
 * arrow does not leave through.
 */
function tagFont(label: string, box: number): number {
  return box < 34 ? 0 : fitFont(label, box, 9.5);
}

/**
 * A jump along the bottom row, such as a rolling DP row reading to its left.
 * Drawn through the row it would cover every number it passes, so in a table
 * that asked for it, it dips into the band the layout keeps under the row and
 * carries its label there.
 */
function underArrow(arrow: MatrixArrow, view: MatrixSnapshot): boolean {
  const last = view.rows - 1;
  return view.arrowsUnder && arrow.from.row === last && arrow.to.row === last && Math.abs(arrow.to.col - arrow.from.col) > 1;
}

function paintFor(animate: boolean, durationMs: number): { readonly ms: number; readonly paint: string } {
  const ms = Math.min(220, Math.max(60, durationMs * 0.6));
  return { ms, paint: animate ? `fill ${ms}ms var(--ease-paint), stroke ${ms}ms var(--ease-paint)` : 'none' };
}

function ArrowDefs(): ReactNode {
  return (
    <defs>
      <marker id="matrix-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
      </marker>
    </defs>
  );
}

function Strips({ strips, bottom, roles, animate, ms, ink }: {
  readonly strips: readonly Strip[];
  readonly bottom: number;
  readonly roles: ReadonlyMap<EntityId, HighlightRole>;
  readonly animate: boolean;
  readonly ms: number;
  readonly ink: InkMap;
}): ReactNode {
  return strips.map((strip, row) => (
    <StripRow
      key={strip.label}
      strip={strip}
      y={bottom + 12 + row * STRIP_HEIGHT}
      roles={roles}
      transition={animate ? `transform ${ms}ms var(--ease-slide)` : 'none'}
      animate={animate}
      ink={ink}
    />
  ));
}

interface MatrixPaneProps {
  readonly view: MatrixSnapshot;
  readonly stack: StackLayout;
  readonly place: PanePlace;
  /** Prepended to every ref this table looks up: "" alone, "pane/" in a split frame. */
  readonly prefix: string;
  readonly title: string | null;
  readonly roles: ReadonlyMap<EntityId, HighlightRole>;
  readonly pointers: Pointers;
  readonly ink: InkMap;
  readonly animate: boolean;
  readonly paint: string;
}

function MatrixPane({ view, stack, place, prefix, title, roles, pointers, ink, animate, paint }: MatrixPaneProps): ReactNode {
  const { rows, cols, cells, rowHeaders, colHeaders, rowTitle, colTitle, arrows, path } = view;
  const tags = useMemo(() => pointerTags(pointers, prefix, rows, cols), [pointers, prefix, rows, cols]);
  const walked = useMemo(() => new Set(path.map((step) => step.row * cols + step.col)), [path, cols]);
  const sourceTags = useMemo(() => {
    const out = new Map<number, { readonly text: string; readonly top: boolean }>();
    for (const arrow of arrows) {
      if (arrow.label === undefined) continue;
      if (underArrow(arrow, view)) continue;
      const at = arrow.from.row * cols + arrow.from.col;
      const held = out.get(at);
      const top = arrow.to.row > arrow.from.row;
      out.set(at, held === undefined ? { text: arrow.label, top } : { text: `${held.text}/${arrow.label}`, top: held.top && top });
    }
    return out;
  }, [arrows, view, cols]);

  const { cell, x0, headerW } = stack;
  const { y0 } = place;
  const roleOf = (ref: string): HighlightRole | undefined => roles.get(prefix + ref);
  const box = cell - GAP;
  const valueSize = Math.min(14, cell * 0.36);
  const showValues = cell >= 14;
  const headerSize = Math.min(12, cell * 0.42);
  // The arrowhead scales with the stroke, so a small table gets a small head that still fits the gap.
  const arrowWidth = Math.max(1.1, Math.min(1.8, cell * 0.04));
  const centre = (row: number, col: number): { x: number; y: number } => ({
    x: x0 + col * cell + cell / 2,
    y: y0 + row * cell + cell / 2,
  });

  const headerChip = (key: string, x: number, y: number, w: number, h: number, text: string, role: HighlightRole | undefined): ReactNode => (
    <g key={key}>
      {role !== undefined && (
        <rect x={x + 1} y={y + 1} width={w - 2} height={h - 2} rx={3} fill={ROLE_COLOR[role]} style={{ transition: paint }} />
      )}
      <text
        x={x + w / 2}
        y={y + h / 2 + 4}
        textAnchor="middle"
        fontSize={fitFont(text, w, headerSize)}
        fontWeight={600}
        fill={role === undefined ? 'var(--viz-text)' : ink[role]}
        className="font-mono"
      >
        {text}
      </text>
    </g>
  );

  return (
    <g>
      {title !== null && (
        <text x={x0 - stack.left} y={place.paneTitleY + 4} fontSize={11} fill="var(--viz-text-dim)" className="font-mono">
          {title}
        </text>
      )}

      {/* titles: the row title reads down from the corner, the column title across, centred but never left of the grid */}
      <text x={x0 - 8} y={place.titleY + 4} textAnchor="end" fontSize={10} fill="var(--viz-text-dim)" className="font-mono">
        {`${rowTitle} ↓`}
      </text>
      <text x={x0 + Math.max(0, (cell * cols - (colTitle.length + 2) * 10 * CHAR_W) / 2)} y={place.titleY + 4} fontSize={10} fill="var(--viz-text-dim)" className="font-mono">
        {`${colTitle} →`}
      </text>

      {colHeaders.map((text, col) =>
        headerChip(`ch-${col}`, x0 + col * cell, place.headerY, cell, HEADER_H - 2, text, roleOf(`col:${col}`)),
      )}
      {rowHeaders.map((text, row) =>
        headerChip(`rh-${row}`, x0 - headerW - 2, y0 + row * cell + (cell - Math.min(cell, 22)) / 2, headerW, Math.min(cell, 22), text, roleOf(`row:${row}`)),
      )}

      {Array.from({ length: rows * cols }, (_, at) => {
        const row = Math.floor(at / cols);
        const col = at % cols;
        const value = cells[at] ?? null;
        const role = roleOf(`cell:${row}:${col}`);
        const fillName: FillName = role ?? (walked.has(at) ? 'sorted' : 'default');
        const filled = role !== undefined || value !== null || walked.has(at);
        const fill = filled ? `var(--viz-${fillName})` : 'var(--viz-bg)';
        const mark = markFor(role);
        const stroke = mark === null ? null : rectMark(mark, box, box);
        const x = x0 + col * cell + GAP / 2;
        const y = y0 + row * cell + GAP / 2;
        const tag = sourceTags.get(at);
        const tagSize = tag === undefined ? 0 : tagFont(tag.text, box);
        const tagged = tag !== undefined && tagSize >= MIN_TAG_FONT;
        return (
          <g key={at}>
            <rect
              x={x}
              y={y}
              width={box}
              height={box}
              rx={Math.min(4, box / 5)}
              fill={fill}
              stroke={filled ? 'none' : 'var(--viz-grid)'}
              strokeWidth={1}
              style={{ transition: paint }}
            />
            {stroke !== null && (
              <rect
                x={x + stroke.width / 2 + 1}
                y={y + stroke.width / 2 + 1}
                width={box - stroke.width - 2}
                height={box - stroke.width - 2}
                rx={stroke.radius}
                fill="none"
                stroke={ink[fillName]}
                strokeWidth={stroke.width}
                strokeDasharray={stroke.dash}
              />
            )}
            {showValues && value !== null && (
              <text
                x={x + box / 2}
                y={y + box / 2 + valueSize * 0.36 + (tagged ? (tag.top ? 1 : -1) * box * 0.1 : 0)}
                textAnchor="middle"
                fontSize={fitFont(String(value), box, valueSize)}
                fontWeight={600}
                fill={ink[fillName]}
                className="font-mono"
              >
                {value}
              </text>
            )}
            {tagged && (
              <text
                x={x + box / 2}
                y={tag.top ? y + box * 0.13 + tagSize * 0.75 : y + box - box * 0.13}
                textAnchor="middle"
                fontSize={tagSize}
                fill={ink[fillName]}
                className="font-mono"
              >
                {tag.text}
              </text>
            )}
          </g>
        );
      })}

      {/* the current cell's dependencies, drawn over the cells with a halo so they read on any fill */}
      {arrows.map((arrow) => {
        const a = centre(arrow.from.row, arrow.from.col);
        const b = centre(arrow.to.row, arrow.to.col);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy) || 1;
        const ux = dx / length;
        const uy = dy / length;
        if (underArrow(arrow, view)) {
          // Out of the source's bottom edge, under the row, and up into the target's.
          const y1 = a.y + box / 2 + 1;
          const dip = UNDER_DIP;
          const d = `M ${a.x} ${y1} Q ${(a.x + b.x) / 2} ${y1 + dip * 2} ${b.x} ${y1 + 3}`;
          return (
            <g
              key={arrowKey(arrow)}
              style={animate ? { animation: `viz-fade-rise var(--duration-base) var(--ease-enter) backwards` } : undefined}
            >
              <path d={d} fill="none" stroke="var(--viz-bg)" strokeWidth={arrowWidth + 3.2} strokeLinecap="round" />
              <path d={d} fill="none" stroke="var(--viz-text)" strokeWidth={arrowWidth} markerEnd="url(#matrix-arrow)" />
              {arrow.label !== undefined && (
                <text
                  x={(a.x + b.x) / 2}
                  y={y1 + dip + 13}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="var(--viz-text)"
                  stroke="var(--viz-bg)"
                  strokeWidth={3}
                  paintOrder="stroke"
                  className="font-mono"
                >
                  {arrow.label}
                </text>
              )}
            </g>
          );
        }
        // Leave through the source's edge, clear of its value, and stop short of the target's.
        const exit = box / 2 / Math.max(Math.abs(ux), Math.abs(uy)) - cell * 0.12;
        const x1 = a.x + ux * exit;
        const y1 = a.y + uy * exit;
        const x2 = b.x - ux * cell * 0.26;
        const y2 = b.y - uy * cell * 0.26;
        // A long jump bows so it does not run through the numbers it passes.
        const bow = length > cell * 1.6 ? Math.min(cell * 0.6, length * 0.12) : 0;
        const cx = (x1 + x2) / 2 - uy * bow;
        const cy = (y1 + y2) / 2 + ux * bow;
        const d = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
        const lx = (x1 + 2 * cx + x2) / 4 - uy * 10;
        const ly = (y1 + 2 * cy + y2) / 4 + ux * 10;
        // A label too long for its source cell rides along the arrow, if the arrow is long
        // enough to carry it; on a short one it is dropped, and the explanation names the move.
        const loose =
          arrow.label !== undefined &&
          bow > 0 &&
          tagFont(sourceTags.get(arrow.from.row * cols + arrow.from.col)?.text ?? '', box) < MIN_TAG_FONT;
        return (
          <g
            key={arrowKey(arrow)}
            style={animate ? { animation: `viz-fade-rise var(--duration-base) var(--ease-enter) backwards` } : undefined}
          >
            <path d={d} fill="none" stroke="var(--viz-bg)" strokeWidth={arrowWidth + 3.2} strokeLinecap="round" />
            <path d={d} fill="none" stroke="var(--viz-text)" strokeWidth={arrowWidth} markerEnd="url(#matrix-arrow)" />
            {loose && (
              <text
                x={lx}
                y={ly + 3.5}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill="var(--viz-text)"
                stroke="var(--viz-bg)"
                strokeWidth={3}
                paintOrder="stroke"
                className="font-mono"
              >
                {arrow.label}
              </text>
            )}
          </g>
        );
      })}

      {[...tags.cols.entries()].map(([col, labels]) => {
        const x = x0 + col * cell + cell / 2;
        const y = place.pointerY;
        return (
          <g key={`cp-${col}`}>
            <text x={x} y={y + 10} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--viz-active)" className="font-mono">
              {labels.join(',')}
            </text>
            <path d={`M ${x - 4} ${y + 13} L ${x + 4} ${y + 13} L ${x} ${y + 18} Z`} fill="var(--viz-active)" />
          </g>
        );
      })}
      {[...tags.rows.entries()].map(([row, labels]) => {
        const x = x0 - headerW - 6;
        const y = y0 + row * cell + cell / 2;
        return (
          <g key={`rp-${row}`}>
            <text x={x - 9} y={y + 4} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--viz-active)" className="font-mono">
              {labels.join(',')}
            </text>
            <path d={`M ${x - 6} ${y - 4} L ${x - 6} ${y + 4} L ${x - 1} ${y} Z`} fill="var(--viz-active)" />
          </g>
        );
      })}
      {[...tags.cells.entries()].map(([target, labels]) => {
        const ref = parseMatrixRef(target);
        if (ref === null || ref.kind !== 'cell') return null;
        return (
          <text
            key={`cellp-${target}`}
            x={x0 + ref.col * cell + GAP / 2 + 2}
            y={y0 + ref.row * cell + GAP / 2 + 1}
            fontSize={10}
            fontWeight={600}
            fill="var(--viz-active)"
            stroke="var(--viz-bg)"
            strokeWidth={3}
            paintOrder="stroke"
            className="font-mono"
          >
            {labels.join(',')}
          </text>
        );
      })}
    </g>
  );
}

export interface MatrixRendererProps {
  readonly snapshot: MatrixSnapshot;
  readonly ink: InkMap;
  readonly highlights: Highlights;
  readonly pointers: Pointers;
  readonly animate: boolean;
  readonly durationMs: number;
}

function MatrixRendererImpl({ snapshot, ink, highlights, pointers, animate, durationMs }: MatrixRendererProps): ReactNode {
  const { rows, cols, rowHeaders, rowTitle, arrowsUnder } = snapshot;
  const strips = snapshot.strips.length;
  const stack = useMemo(
    () => matrixStackLayout([{ rows, cols, rowHeaders, rowTitle, arrowsUnder }], strips, false),
    [rows, cols, rowHeaders, rowTitle, arrowsUnder, strips],
  );
  const roles = useMemo(() => resolveRoles(highlights), [highlights]);
  const { ms, paint } = paintFor(animate, durationMs);
  const place = stack.panes[0];

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full select-none"
      role="img"
      aria-label={`Table of ${counted(rows, 'row')} and ${counted(cols, 'column')}`}
    >
      <ArrowDefs />
      {place !== undefined && (
        <MatrixPane
          view={snapshot}
          stack={stack}
          place={place}
          prefix=""
          title={null}
          roles={roles}
          pointers={pointers}
          ink={ink}
          animate={animate}
          paint={paint}
        />
      )}
      <Strips strips={snapshot.strips} bottom={stack.bottom} roles={roles} animate={animate} ms={ms} ink={ink} />
    </svg>
  );
}

export const MatrixRenderer = memo(MatrixRendererImpl);

export interface SplitRendererProps {
  readonly snapshot: SplitSnapshot;
  readonly ink: InkMap;
  readonly highlights: Highlights;
  readonly pointers: Pointers;
  readonly animate: boolean;
  readonly durationMs: number;
}

/** Shapes are fixed for the run, so this key changes only between runs. */
function shapeKey(snapshot: SplitSnapshot): string {
  return snapshot.panes
    .map(({ view }) => `${view.rows}x${view.cols}|${view.arrowsUnder ? 'u' : ''}|${view.rowTitle}|${view.rowHeaders.join('\u0000')}`)
    .join('\u0001');
}

function SplitRendererImpl({ snapshot, ink, highlights, pointers, animate, durationMs }: SplitRendererProps): ReactNode {
  const strips = snapshot.strips.length;
  const key = shapeKey(snapshot);
  // Keyed on the shapes rather than the panes, which are new objects every frame.
  const stack = useMemo(() => matrixStackLayout(snapshot.panes.map((pane) => pane.view), strips, true), [key, strips]);
  const roles = useMemo(() => resolveRoles(highlights), [highlights]);
  const { ms, paint } = paintFor(animate, durationMs);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full select-none"
      role="img"
      aria-label={snapshot.panes.map((pane) => `${pane.title}: ${pane.view.rows} by ${pane.view.cols} table`).join('; ')}
    >
      <ArrowDefs />
      {snapshot.panes.map((pane, at) => {
        const place = stack.panes[at];
        if (place === undefined) return null;
        return (
          <MatrixPane
            key={pane.id}
            view={pane.view}
            stack={stack}
            place={place}
            prefix={`${pane.id}/`}
            title={pane.title}
            roles={roles}
            pointers={pointers}
            ink={ink}
            animate={animate}
            paint={paint}
          />
        );
      })}
      <Strips strips={snapshot.strips} bottom={stack.bottom} roles={roles} animate={animate} ms={ms} ink={ink} />
    </svg>
  );
}

export const SplitRenderer = memo(SplitRendererImpl);
