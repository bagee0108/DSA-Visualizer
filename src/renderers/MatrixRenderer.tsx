/**
 * Matrix renderer: a DP table. Shape, headers and titles are fixed for the
 * run, so the layout is computed once per run and a frame only refills cells,
 * recolours and redraws the current cell's dependency arrows.
 */

import { memo, useMemo, type ReactNode } from 'react';

import { parseMatrixRef } from '../core/matrixScene';
import type { Highlights, HighlightRole, MatrixArrow, MatrixSnapshot, Pointers } from '../core/types';
import { VIEW_H, VIEW_W } from './canvas';
import type { FillName, InkMap } from './ink';
import { markFor, rectMark, ROLE_COLOR, resolveRoles } from './roles';
import { PAD_X, STRIP_HEIGHT, StripRow } from './strips';

export const MATRIX_TOP = 10;
/** Column title, then column pointers, then column headers, then the grid. */
export const TITLE_H = 18;
export const POINTER_H = 20;
export const HEADER_H = 20;
/** Row pointers sit left of the row headers; labels are short names such as i or j. */
export const ROW_POINTER_W = 40;
export const MAX_CELL = 56;
const GAP = 3;
/** Mono glyphs run about 0.6 em wide. */
const CHAR_W = 0.6;
/** Smallest arrow label worth printing inside its source cell. */
const MIN_TAG_FONT = 7;

export interface MatrixShape {
  readonly rows: number;
  readonly cols: number;
  readonly rowHeaders: readonly string[];
  readonly rowTitle: string;
  readonly strips: number;
}

export interface MatrixLayout {
  readonly cell: number;
  /** Top-left corner of the grid itself. */
  readonly x0: number;
  readonly y0: number;
  readonly headerW: number;
  readonly titleY: number;
  readonly pointerY: number;
  readonly headerY: number;
  /** Where the band above the strips ends. */
  readonly bottom: number;
}

export function matrixBandBottom(strips: number): number {
  return VIEW_H - strips * STRIP_HEIGHT - 10;
}

function longest(labels: readonly string[]): number {
  return labels.reduce((max, label) => Math.max(max, label.length), 1);
}

/**
 * The biggest square cell that fits both ways, with the gutters for titles,
 * pointers and headers taken out first. Table and gutters are centred as one
 * piece, so a small table sits in the middle rather than hugging the left.
 */
export function matrixLayout(shape: MatrixShape): MatrixLayout {
  const bottom = matrixBandBottom(shape.strips);
  const headerW = Math.max(22, longest(shape.rowHeaders) * 12 * CHAR_W + 12);
  // The row title sits in the corner and must not run off the left edge.
  const titleW = (shape.rowTitle.length + 2) * 10 * CHAR_W + 8;
  const left = Math.max(ROW_POINTER_W + headerW, titleW);
  const top = MATRIX_TOP + TITLE_H + POINTER_H + HEADER_H;

  const availW = VIEW_W - PAD_X * 2 - left;
  const availH = bottom - top;
  const cell = Math.min(MAX_CELL, availW / shape.cols, availH / shape.rows);

  const x0 = (VIEW_W - (left + cell * shape.cols)) / 2 + left;
  const y0 = top + (availH - cell * shape.rows) / 2;
  return {
    cell,
    x0,
    y0,
    headerW,
    titleY: y0 - HEADER_H - POINTER_H - TITLE_H / 2,
    pointerY: y0 - HEADER_H - POINTER_H,
    headerY: y0 - HEADER_H,
    bottom,
  };
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

function pointerTags(pointers: Pointers, rows: number, cols: number): PointerTags {
  const out = { rows: new Map<number, string[]>(), cols: new Map<number, string[]>(), cells: new Map<string, string[]>() };
  const add = <K,>(map: Map<K, string[]>, key: K, label: string): void => {
    const bucket = map.get(key);
    if (bucket === undefined) map.set(key, [label]);
    else bucket.push(label);
  };
  for (const [label, target] of Object.entries(pointers)) {
    if (typeof target !== 'string') continue;
    const ref = parseMatrixRef(target);
    if (ref === null) continue;
    if (ref.kind === 'row' && ref.index < rows) add(out.rows, ref.index, label);
    else if (ref.kind === 'col' && ref.index < cols) add(out.cols, ref.index, label);
    else if (ref.kind === 'cell' && ref.row < rows && ref.col < cols) add(out.cells, target, label);
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

export interface MatrixRendererProps {
  readonly snapshot: MatrixSnapshot;
  readonly ink: InkMap;
  readonly highlights: Highlights;
  readonly pointers: Pointers;
  readonly animate: boolean;
  readonly durationMs: number;
}

function MatrixRendererImpl({ snapshot, ink, highlights, pointers, animate, durationMs }: MatrixRendererProps): ReactNode {
  const { rows, cols, cells, rowHeaders, colHeaders, rowTitle, colTitle, arrows, path } = snapshot;
  const strips = snapshot.strips.length;
  const layout = useMemo(
    () => matrixLayout({ rows, cols, rowHeaders, rowTitle, strips }),
    [rows, cols, rowHeaders, rowTitle, strips],
  );
  const roles = useMemo(() => resolveRoles(highlights), [highlights]);
  const tags = useMemo(() => pointerTags(pointers, rows, cols), [pointers, rows, cols]);
  const walked = useMemo(() => new Set(path.map((step) => step.row * cols + step.col)), [path, cols]);
  const sourceTags = useMemo(() => {
    const out = new Map<number, { readonly text: string; readonly top: boolean }>();
    for (const arrow of arrows) {
      if (arrow.label === undefined) continue;
      const at = arrow.from.row * cols + arrow.from.col;
      const held = out.get(at);
      const top = arrow.to.row > arrow.from.row;
      out.set(at, held === undefined ? { text: arrow.label, top } : { text: `${held.text}/${arrow.label}`, top: held.top && top });
    }
    return out;
  }, [arrows, cols]);

  const ms = Math.min(220, Math.max(60, durationMs * 0.6));
  const paint = animate ? `fill ${ms}ms var(--ease-paint), stroke ${ms}ms var(--ease-paint)` : 'none';
  const { cell, x0, y0, headerW } = layout;
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
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full select-none"
      role="img"
      aria-label={`Table of ${rows} rows and ${cols} columns`}
    >
      <defs>
        <marker id="matrix-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
      </defs>

      {/* titles: the row title reads down from the corner, the column title across, centred but never left of the grid */}
      <text x={x0 - 8} y={layout.titleY + 4} textAnchor="end" fontSize={10} fill="var(--viz-text-dim)" className="font-mono">
        {`${rowTitle} ↓`}
      </text>
      <text x={x0 + Math.max(0, (cell * cols - (colTitle.length + 2) * 10 * CHAR_W) / 2)} y={layout.titleY + 4} fontSize={10} fill="var(--viz-text-dim)" className="font-mono">
        {`${colTitle} →`}
      </text>

      {colHeaders.map((text, col) =>
        headerChip(`ch-${col}`, x0 + col * cell, layout.headerY, cell, HEADER_H - 2, text, roles.get(`col:${col}`)),
      )}
      {rowHeaders.map((text, row) =>
        headerChip(`rh-${row}`, x0 - headerW - 2, y0 + row * cell + (cell - Math.min(cell, 22)) / 2, headerW, Math.min(cell, 22), text, roles.get(`row:${row}`)),
      )}

      {Array.from({ length: rows * cols }, (_, at) => {
        const row = Math.floor(at / cols);
        const col = at % cols;
        const value = cells[at] ?? null;
        const role = roles.get(`cell:${row}:${col}`);
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
        // Only a label too long for its source cell is printed along the arrow.
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
        const y = layout.pointerY;
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

      {snapshot.strips.map((strip, row) => (
        <StripRow
          key={strip.label}
          strip={strip}
          y={layout.bottom + 12 + row * STRIP_HEIGHT}
          roles={roles}
          transition={animate ? `transform ${ms}ms var(--ease-slide)` : 'none'}
          animate={animate}
          ink={ink}
        />
      ))}
    </svg>
  );
}

export const MatrixRenderer = memo(MatrixRendererImpl);
