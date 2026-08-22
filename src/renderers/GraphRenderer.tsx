/**
 * Graph renderer. Takes one frame and draws it. Node positions come from the
 * Graph, which every frame of a run shares by reference, so geometry is
 * computed once per run and a frame only recolours.
 */

import { memo, useMemo, type ReactNode } from 'react';

import { LAYOUT_ASPECT } from '../core/graphLayout';
import type { Graph, GraphSnapshot, Highlights, Pointers } from '../core/types';
import { ROLE_COLOR, resolveRoles } from './roles';
import { PAD_X, STRIP_HEIGHT, StripRow, VIEW_W } from './strips';

const VIEW_H = 400;
const TOP = 12;

export interface GraphRendererProps {
  readonly snapshot: GraphSnapshot;
  readonly highlights: Highlights;
  readonly pointers: Pointers;
  readonly animate: boolean;
  readonly durationMs: number;
}

interface Placed {
  readonly x: number;
  readonly y: number;
}

interface Geometry {
  readonly positions: ReadonlyMap<string, Placed>;
  readonly radius: number;
  readonly edges: readonly {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
    readonly mx: number;
    readonly my: number;
    readonly weight: string | null;
  }[];
}

function geometryFor(graph: Graph, bottom: number): Geometry {
  const innerW = VIEW_W - PAD_X * 2;
  const innerH = bottom - TOP;
  const boxH = 1 / LAYOUT_ASPECT;
  const scale = Math.min(innerW, innerH / boxH);
  const x0 = (VIEW_W - scale) / 2;
  const y0 = TOP + (innerH - scale * boxH) / 2;

  const n = graph.nodes.length;
  const radius = n <= 12 ? 16 : n <= 30 ? 13 : n <= 60 ? 10 : n <= 100 ? 8 : 6.5;

  const positions = new Map<string, Placed>();
  for (const node of graph.nodes) positions.set(node.id, { x: x0 + node.x * scale, y: y0 + node.y * scale });

  const edges = graph.edges.flatMap((edge) => {
    const a = positions.get(edge.from);
    const b = positions.get(edge.to);
    if (a === undefined || b === undefined) return [];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    // Stop short of the circles so arrowheads sit on the rim.
    const trim = radius + 1;
    return [
      {
        id: edge.id,
        from: edge.from,
        to: edge.to,
        x1: a.x + ux * trim,
        y1: a.y + uy * trim,
        x2: b.x - ux * (graph.directed ? trim + 4 : trim),
        y2: b.y - uy * (graph.directed ? trim + 4 : trim),
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
        weight: edge.weight === undefined ? null : String(edge.weight),
      },
    ];
  });

  return { positions, radius, edges };
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

function GraphRendererImpl({ snapshot, highlights, pointers, animate, durationMs }: GraphRendererProps): ReactNode {
  const { graph } = snapshot;
  const bottom = VIEW_H - snapshot.strips.length * STRIP_HEIGHT - 10;
  const geometry = useMemo(() => geometryFor(graph, bottom), [graph, bottom]);
  const roles = useMemo(() => resolveRoles(highlights), [highlights]);
  const labels = useMemo(() => pointerLabels(pointers), [pointers]);
  const visited = useMemo(() => new Set(snapshot.visited), [snapshot.visited]);
  const treeEdges = useMemo(() => new Set(snapshot.treeEdges), [snapshot.treeEdges]);

  const ms = Math.min(220, Math.max(60, durationMs * 0.6));
  const paint = animate ? `fill ${ms}ms ease-out, stroke ${ms}ms ease-out, stroke-width ${ms}ms ease-out` : 'none';
  const { radius } = geometry;
  const showText = radius >= 7;
  const showWeights = graph.weighted && graph.edges.length <= 220;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full select-none"
      role="img"
      aria-label={`Graph of ${graph.nodes.length} nodes and ${graph.edges.length} edges`}
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
        <marker id="link-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
      </defs>

      {geometry.edges.map((edge) => {
        const role = roles.get(`edge:${edge.id}`);
        const tree = treeEdges.has(edge.id);
        const stroke = role !== undefined ? ROLE_COLOR[role] : tree ? 'var(--viz-active)' : 'var(--viz-grid)';
        const width = role !== undefined ? 3.5 : tree ? 2.5 : 1.4;
        return (
          <g key={edge.id}>
            <line
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              stroke={stroke}
              strokeWidth={width}
              strokeOpacity={role === undefined && !tree ? 0.9 : 1}
              markerEnd={graph.directed ? 'url(#arrow)' : undefined}
              style={{ transition: paint }}
            />
            {showWeights && edge.weight !== null && (
              <text
                x={edge.mx}
                y={edge.my + 3.5}
                textAnchor="middle"
                fontSize={radius >= 10 ? 10 : 8.5}
                fill={role !== undefined ? ROLE_COLOR[role] : 'var(--viz-text-dim)'}
                stroke="var(--viz-bg)"
                strokeWidth={3}
                paintOrder="stroke"
                className="font-mono"
              >
                {edge.weight}
              </text>
            )}
          </g>
        );
      })}

      {/* algorithm-owned pointers, bowed so they never hide under an edge */}
      {snapshot.links.map((link) => {
        const a = geometry.positions.get(link.from);
        const b = geometry.positions.get(link.to);
        if (a === undefined || b === undefined) return null;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy) || 1;
        const ux = dx / length;
        const uy = dy / length;
        const x1 = a.x + ux * (radius + 1);
        const y1 = a.y + uy * (radius + 1);
        const x2 = b.x - ux * (radius + 5);
        const y2 = b.y - uy * (radius + 5);
        const bow = Math.min(18, length * 0.18);
        const cx = (x1 + x2) / 2 - uy * bow;
        const cy = (y1 + y2) / 2 + ux * bow;
        const role = roles.get(`link:${link.from}`);
        return (
          <path
            key={`link-${link.from}`}
            d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
            fill="none"
            stroke={role === undefined ? 'var(--viz-pivot)' : ROLE_COLOR[role]}
            strokeWidth={role === undefined ? 2 : 3.5}
            strokeOpacity={role === undefined ? 0.85 : 1}
            markerEnd="url(#link-arrow)"
            style={{ transition: animate ? `d ${ms}ms ease-in-out, ${paint}` : 'none' }}
          />
        );
      })}

      {graph.nodes.map((node) => {
        const placed = geometry.positions.get(node.id);
        if (placed === undefined) return null;
        const role = roles.get(node.id);
        const fill = role !== undefined ? ROLE_COLOR[role] : visited.has(node.id) ? 'var(--viz-visited)' : 'var(--viz-default)';
        const tags = labels.get(node.id);
        const label = snapshot.labels[node.id];
        return (
          <g key={node.id} transform={`translate(${placed.x} ${placed.y})`}>
            <circle r={radius} fill={fill} stroke="var(--viz-bg)" strokeWidth={1.5} style={{ transition: paint }} />
            {showText && (
              <text
                y={radius * 0.36}
                textAnchor="middle"
                fontSize={Math.min(11, radius * 0.95)}
                fontWeight={600}
                fill={role !== undefined || visited.has(node.id) ? '#fff' : 'var(--viz-text)'}
                className="font-mono"
              >
                {node.label}
              </text>
            )}
            {label !== undefined && (
              <text
                x={radius + 2}
                y={-radius * 0.35}
                fontSize={radius >= 10 ? 10 : 8.5}
                fontWeight={600}
                fill="var(--viz-text)"
                stroke="var(--viz-bg)"
                strokeWidth={3}
                paintOrder="stroke"
                className="font-mono"
              >
                {label}
              </text>
            )}
            {tags !== undefined && (
              <text
                y={-radius - 4}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill="var(--viz-active)"
                stroke="var(--viz-bg)"
                strokeWidth={3}
                paintOrder="stroke"
                className="font-mono"
              >
                {tags.join(',')}
              </text>
            )}
          </g>
        );
      })}

      {snapshot.strips.map((strip, row) => (
        <StripRow key={strip.label} strip={strip} y={bottom + 12 + row * STRIP_HEIGHT} roles={roles} transition={animate ? `transform ${ms}ms ease-in-out` : 'none'} />
      ))}
    </svg>
  );
}

export const GraphRenderer = memo(GraphRendererImpl);
