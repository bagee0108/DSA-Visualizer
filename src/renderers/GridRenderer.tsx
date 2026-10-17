/**
 * Board renderer: a grid of squares with rank and file headers, pieces drawn
 * as glyphs or text, the lines that rule squares out, and - when the run
 * searches - its search tree beside the board, drawn by the tree renderer's
 * own layer so it looks and moves like every other tree in the app.
 */

import { memo, useMemo, type ReactNode } from 'react';

import { cellRef, colRef, rowRef } from '../core/matrixScene';
import type { GridSnapshot, Highlights, Pointers } from '../core/types';
import { VIEW_H, VIEW_W } from './canvas';
import type { FillName, InkMap } from './ink';
import { markFor, rectMark, resolveRoles, ROLE_COLOR } from './roles';
import { STRIP_HEIGHT, StripRow } from './strips';
import { TreeLayer, treeScale, type TreeRunBound } from './TreeRenderer';

/** Column headers and their pointer tags sit above the board. */
const HEAD_TOP = 40;
const HEAD_LEFT = 46;
const PAD = 14;
export const SQUARE_MAX = 64;
/** The board's share of the width when a search tree sits beside it. */
export const BOARD_SHARE = 0.46;
const TREE_GAP = 18;

export interface GridLayout {
  readonly square: number;
  /** Top-left of square (0, 0). */
  readonly x0: number;
  readonly y0: number;
  /** Bottom of the band the board and tree share; strips start below it. */
  readonly bottom: number;
  /** The tree's box, or null without a tree. */
  readonly tree: { readonly x: number; readonly width: number } | null;
}

export function gridLayout(rows: number, cols: number, strips: number, withTree: boolean): GridLayout {
  const bottom = VIEW_H - strips * STRIP_HEIGHT - (strips > 0 ? 10 : 0);
  const boardWidth = withTree ? VIEW_W * BOARD_SHARE : VIEW_W;
  const square = Math.min(SQUARE_MAX, (bottom - HEAD_TOP - PAD) / rows, (boardWidth - HEAD_LEFT - 2 * PAD) / cols);
  const x0 = HEAD_LEFT + PAD + (boardWidth - HEAD_LEFT - 2 * PAD - square * cols) / 2;
  const y0 = HEAD_TOP + (bottom - HEAD_TOP - PAD - square * rows) / 2;
  const tree = withTree ? { x: boardWidth + TREE_GAP, width: VIEW_W - boardWidth - TREE_GAP } : null;
  return { square, x0, y0, bottom, tree };
}

export interface GridRendererProps {
  readonly snapshot: GridSnapshot;
  readonly bound: TreeRunBound;
  readonly ink: InkMap;
  readonly highlights: Highlights;
  readonly pointers: Pointers;
  readonly animate: boolean;
  readonly durationMs: number;
}

/** A queen in a 24-unit box: a five-point crown on a base. */
function Queen({ size, fill }: { size: number; fill: string }): ReactNode {
  const k = size / 24;
  return (
    <g transform={`translate(${-size / 2}, ${-size / 2}) scale(${k})`} fill={fill}>
      <path d="M4.5 17.5 L2.5 8 L8 12.2 L12 4.8 L16 12.2 L21.5 8 L19.5 17.5 Z" />
      <rect x={4} y={18.6} width={16} height={2.6} rx={1} />
      <circle cx={2.5} cy={7.4} r={1.6} />
      <circle cx={12} cy={4.2} r={1.6} />
      <circle cx={21.5} cy={7.4} r={1.6} />
    </g>
  );
}

function tagsByTarget(pointers: Pointers): ReadonlyMap<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [label, target] of Object.entries(pointers)) {
    if (typeof target !== 'string') continue;
    const bucket = out.get(target);
    if (bucket === undefined) out.set(target, [label]);
    else bucket.push(label);
  }
  return out;
}

function GridRendererImpl({ snapshot, bound, ink, highlights, pointers, animate, durationMs }: GridRendererProps): ReactNode {
  const { rows, cols, cells, piece, checkered, rowHeaders, colHeaders, lines, tree, strips } = snapshot;
  const layout = useMemo(() => gridLayout(rows, cols, strips.length, tree !== null), [rows, cols, strips.length, tree]);
  const roles = useMemo(() => resolveRoles(highlights), [highlights]);
  const tags = useMemo(() => tagsByTarget(pointers), [pointers]);
  const treeLook = useMemo(
    () => (layout.tree === null ? null : treeScale(bound, layout.tree.width, layout.bottom)),
    [bound, layout],
  );

  const { square, x0, y0 } = layout;
  const moveMs = Math.min(220, Math.max(60, durationMs * 0.6));
  const fade = animate ? `fill ${moveMs}ms ease-out` : 'none';
  const centre = (row: number, col: number): { x: number; y: number } => ({ x: x0 + (col + 0.5) * square, y: y0 + (row + 0.5) * square });
  const font = Math.min(26, square * 0.5);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full select-none"
      role="img"
      aria-label={`Board of ${rows} by ${cols}${tree === null ? '' : ', with its search tree'}`}
    >
      {colHeaders.map((label, col) => {
        const tagged = tags.get(colRef(col));
        return (
          <g key={`col-${col}`}>
            <text x={x0 + (col + 0.5) * square} y={y0 - 8} textAnchor="middle" fontSize={11} fill="var(--viz-text-dim)" className="font-mono">
              {label}
            </text>
            {tagged !== undefined && (
              <text x={x0 + (col + 0.5) * square} y={y0 - 24} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--viz-active)" className="font-mono">
                {tagged.join(',')}
              </text>
            )}
          </g>
        );
      })}
      {rowHeaders.map((label, row) => {
        const tagged = tags.get(rowRef(row));
        const y = y0 + (row + 0.5) * square;
        return (
          <g key={`row-${row}`}>
            <text x={x0 - 8} y={y + 4} textAnchor="end" fontSize={11} fill="var(--viz-text-dim)" className="font-mono">
              {label}
            </text>
            {tagged !== undefined && (
              <g>
                <path d={`M ${x0 - 30} ${y - 5} L ${x0 - 30} ${y + 5} L ${x0 - 23} ${y} Z`} fill="var(--viz-active)" />
                <text x={x0 - 34} y={y + 4} textAnchor="end" fontSize={11} fontWeight={600} fill="var(--viz-active)" className="font-mono">
                  {tagged.join(',')}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {cells.map((value, at) => {
        const row = Math.floor(at / cols);
        const col = at % cols;
        const role = roles.get(cellRef(row, col));
        const dark = checkered && (row + col) % 2 === 1;
        const fill = role !== undefined ? ROLE_COLOR[role] : value !== null && piece === 'queen' ? 'var(--viz-default)' : dark ? 'var(--viz-grid)' : 'none';
        const mark = markFor(role);
        const stroke = mark === null ? null : rectMark(mark, square, square);
        const x = x0 + col * square;
        const y = y0 + row * square;
        return (
          <g key={`sq-${at}`}>
            <rect x={x} y={y} width={square} height={square} fill={fill} stroke="var(--viz-grid)" strokeWidth={1} style={{ transition: fade }} />
            {stroke !== null && (
              <rect
                x={x + stroke.width / 2}
                y={y + stroke.width / 2}
                width={square - stroke.width}
                height={square - stroke.width}
                fill="none"
                stroke={ink[role ?? 'default']}
                strokeWidth={stroke.width}
                strokeDasharray={stroke.dash}
              />
            )}
          </g>
        );
      })}

      {lines.map((line, at) => {
        const from = centre(line.from.row, line.from.col);
        const to = centre(line.to.row, line.to.col);
        // Foreground ink on a halo of the canvas colour, so the line reads over any fill, the attacker's included.
        return (
          <g key={`line-${at}`}>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="var(--viz-bg)" strokeWidth={7} strokeLinecap="round" strokeOpacity={0.85} />
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="var(--viz-text)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray="6 5"
            />
          </g>
        );
      })}

      {cells.map((value, at) => {
        if (value === null) return null;
        const row = Math.floor(at / cols);
        const col = at % cols;
        const role = roles.get(cellRef(row, col));
        const fillName: FillName = role ?? 'default';
        const { x, y } = centre(row, col);
        return piece === 'queen' ? (
          <g key={`pc-${at}`} transform={`translate(${x}, ${y})`}>
            <Queen size={square * 0.62} fill={ink[fillName]} />
          </g>
        ) : (
          <text key={`pc-${at}`} x={x} y={y + font * 0.36} textAnchor="middle" fontSize={font} fontWeight={600} fill={role === undefined ? 'var(--viz-text)' : ink[fillName]} className="font-mono">
            {value}
          </text>
        );
      })}

      {tree !== null && layout.tree !== null && treeLook !== null && (
        <>
          <line x1={layout.tree.x - TREE_GAP / 2} x2={layout.tree.x - TREE_GAP / 2} y1={HEAD_TOP / 2} y2={layout.bottom - PAD} stroke="var(--viz-grid)" strokeDasharray="3 4" />
          <text x={layout.tree.x + 4} y={16} fontSize={11} fill="var(--viz-text-dim)" className="font-mono">
            search tree
          </text>
          <g transform={`translate(${layout.tree.x}, 0)`}>
            <TreeLayer
              snapshot={tree}
              scale={treeLook}
              width={layout.tree.width}
              ink={ink}
              highlights={highlights}
              pointers={pointers}
              animate={animate}
              durationMs={durationMs}
            />
          </g>
        </>
      )}

      {strips.map((strip, row) => (
        <StripRow
          key={strip.label}
          strip={strip}
          y={layout.bottom + 12 + row * STRIP_HEIGHT}
          roles={roles}
          transition={animate ? `transform ${moveMs}ms var(--ease-slide)` : 'none'}
          animate={animate}
          ink={ink}
        />
      ))}
    </svg>
  );
}

export const GridRenderer = memo(GridRendererImpl);
