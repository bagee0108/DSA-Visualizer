/**
 * Graph renderer. Takes one frame and draws it. Node positions come from the
 * Graph, which every frame of a run shares by reference, so geometry is
 * computed once per run and a frame only recolours.
 */

import { memo, useMemo, type ReactNode } from 'react';

import { LAYOUT_ASPECT, nodeRadius } from '../core/graphLayout';
import type { Graph, GraphComponent, GraphSnapshot, Highlights, Pointers } from '../core/types';
import type { FillName, InkMap } from './ink';
import { counted, VIEW_H, VIEW_W } from './canvas';
import { circleMark, markFor, ROLE_COLOR, resolveRoles } from './roles';
import { bandHeight, PAD_X, STRIP_HEIGHT, StripRow } from './strips';

export const GRAPH_TOP = 12;

/** Peak offset, in view units, of a reciprocal directed edge from the straight line. */
export const RECIPROCAL_BOW_MAX = 14;

/** Below this node radius the graph is too dense for text inside nodes, or for single-node component outlines. */
export const MIN_TEXT_RADIUS = 7;

/** Gap, in view units, between a component's outline and the rims of its nodes. */
export const OUTLINE_PAD = 7;

export interface GraphRendererProps {
  readonly snapshot: GraphSnapshot;
  readonly ink: InkMap;
  readonly highlights: Highlights;
  readonly pointers: Pointers;
  readonly animate: boolean;
  readonly durationMs: number;
  /** Strips are drawn by the page's own strips panel: leave them out and crop the viewBox at the band. */
  readonly stripsApart?: boolean;
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
    /** Control point of the bow for one edge of a reciprocal pair; null for a straight edge. */
    readonly curve: Placed | null;
    readonly weight: string | null;
  }[];
}

/**
 * The layout box is a unit width by 1 / LAYOUT_ASPECT, fitted whole into the
 * band above the strips. LAYOUT_ASPECT tracks this band, so the fit is bound by
 * the width and the height is spent rather than letterboxed.
 */
export function graphBox(bottom: number): { scale: number; x0: number; y0: number } {
  const innerW = VIEW_W - PAD_X * 2;
  const innerH = bottom - GRAPH_TOP;
  const boxH = 1 / LAYOUT_ASPECT;
  const scale = Math.min(innerW, innerH / boxH);
  return { scale, x0: (VIEW_W - scale) / 2, y0: GRAPH_TOP + (innerH - scale * boxH) / 2 };
}

export function graphBandBottom(strips: number): number {
  return VIEW_H - strips * STRIP_HEIGHT - 10;
}

/** A number as drawn: a true minus sign (U+2212), which stays legible at label size where a hyphen thins to a dot. */
export function signed(value: number): string {
  return value < 0 ? `−${-value}` : String(value);
}

export function graphGeometry(graph: Graph, bottom: number): Geometry {
  const { scale, x0, y0 } = graphBox(bottom);

  const n = graph.nodes.length;
  const radius = nodeRadius(n);

  const positions = new Map<string, Placed>();
  for (const node of graph.nodes) positions.set(node.id, { x: x0 + node.x * scale, y: y0 + node.y * scale });

  // u->v and v->u in a directed graph would draw as one line; each bows to its own left instead.
  const directedPairs = new Set(graph.directed ? graph.edges.map((edge) => `${edge.from}>${edge.to}`) : []);

  const edges = graph.edges.flatMap((edge): Geometry['edges'][number][] => {
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
    if (edge.from !== edge.to && directedPairs.has(`${edge.to}>${edge.from}`)) {
      // Left of the direction of travel, so the two edges of a pair bow apart.
      const bow = Math.min(RECIPROCAL_BOW_MAX, length * 0.2);
      const cx = (a.x + b.x) / 2 + uy * bow * 2;
      const cy = (a.y + b.y) / 2 - ux * bow * 2;
      const toward = (from: Placed, by: number): Placed => {
        const ox = cx - from.x;
        const oy = cy - from.y;
        const d = Math.hypot(ox, oy) || 1;
        return { x: from.x + (ox / d) * by, y: from.y + (oy / d) * by };
      };
      const start = toward(a, trim);
      const end = toward(b, trim + 4);
      return [
        {
          id: edge.id,
          from: edge.from,
          to: edge.to,
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
          // The curve's own midpoint, where its weight sits.
          mx: 0.25 * start.x + 0.5 * cx + 0.25 * end.x,
          my: 0.25 * start.y + 0.5 * cy + 0.25 * end.y,
          curve: { x: cx, y: cy },
          weight: edge.weight === undefined ? null : signed(edge.weight),
        },
      ];
    }
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
        curve: null,
        weight: edge.weight === undefined ? null : signed(edge.weight),
      },
    ];
  });

  return { positions, radius, edges };
}

/**
 * How a closed component is drawn: a padded convex hull around its nodes, with
 * its tag under the lowest point, or, when that hull would take in or graze a
 * node of another component, a tag beside each of its own nodes instead. On a
 * graph too dense for node text, a single-node component is not drawn at all;
 * the components strip still lists it.
 */
export type ComponentOutline =
  | { readonly id: string; readonly mode: 'outline'; readonly points: readonly Placed[]; readonly tag: Placed }
  | { readonly id: string; readonly mode: 'tags'; readonly nodes: readonly string[] }
  | { readonly id: string; readonly mode: 'hidden' };

const OUTLINE_SAMPLES = 24;

function cross(o: Placed, a: Placed, b: Placed): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Andrew's monotone chain; counter-clockwise in view space, no repeated end point. */
function convexHull(points: readonly Placed[]): Placed[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const lower: Placed[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2] as Placed, lower[lower.length - 1] as Placed, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Placed[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i] as Placed;
    while (upper.length >= 2 && cross(upper[upper.length - 2] as Placed, upper[upper.length - 1] as Placed, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function segmentDistance(p: Placed, a: Placed, b: Placed): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** True when a circle at p of radius r lies inside the convex polygon or touches its boundary. */
function touchesHull(p: Placed, r: number, hull: readonly Placed[]): boolean {
  let inside = true;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i] as Placed;
    const b = hull[(i + 1) % hull.length] as Placed;
    if (segmentDistance(p, a, b) < r) return true;
    if (cross(a, b, p) < 0) inside = false;
  }
  return inside;
}

export function componentOutlines(geometry: Pick<Geometry, 'positions' | 'radius'>, components: readonly GraphComponent[]): ComponentOutline[] {
  const { positions, radius } = geometry;
  const reach = radius + OUTLINE_PAD;
  return components.map((component): ComponentOutline => {
    if (component.nodes.length === 1 && radius < MIN_TEXT_RADIUS) return { id: component.id, mode: 'hidden' };
    const own = new Set(component.nodes);
    const samples: Placed[] = [];
    for (const id of component.nodes) {
      const at = positions.get(id);
      if (at === undefined) continue;
      for (let k = 0; k < OUTLINE_SAMPLES; k++) {
        const angle = (2 * Math.PI * k) / OUTLINE_SAMPLES;
        samples.push({ x: at.x + reach * Math.cos(angle), y: at.y + reach * Math.sin(angle) });
      }
    }
    const hull = convexHull(samples);
    // Another component's node inside the outline, or under its stroke, would read as a member.
    for (const [id, at] of positions) {
      if (own.has(id)) continue;
      if (touchesHull(at, radius + 1, hull)) return { id: component.id, mode: 'tags', nodes: component.nodes };
    }
    const lowest = hull.reduce((best, p) => (p.y > best.y ? p : best), hull[0] ?? { x: 0, y: 0 });
    return { id: component.id, mode: 'outline', points: hull, tag: lowest };
  });
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

function GraphRendererImpl({ snapshot, ink, highlights, pointers, animate, durationMs, stripsApart = false }: GraphRendererProps): ReactNode {
  const { graph } = snapshot;
  const bottom = graphBandBottom(snapshot.strips.length);
  const geometry = useMemo(() => graphGeometry(graph, bottom), [graph, bottom]);
  const roles = useMemo(() => resolveRoles(highlights), [highlights]);
  const labels = useMemo(() => pointerLabels(pointers), [pointers]);
  const visited = useMemo(() => new Set(snapshot.visited), [snapshot.visited]);
  const outlines = useMemo(() => componentOutlines(geometry, snapshot.components), [geometry, snapshot.components]);
  const nodeTags = useMemo(() => {
    const out = new Map<string, string>();
    for (const outline of outlines) if (outline.mode === 'tags') for (const id of outline.nodes) out.set(id, outline.id);
    return out;
  }, [outlines]);
  const treeEdges = useMemo(() => new Set(snapshot.treeEdges), [snapshot.treeEdges]);

  const ms = Math.min(220, Math.max(60, durationMs * 0.6));
  const paint = animate ? `fill ${ms}ms var(--ease-paint), stroke ${ms}ms var(--ease-paint), stroke-width ${ms}ms var(--ease-paint)` : 'none';
  const { radius } = geometry;
  const showText = radius >= MIN_TEXT_RADIUS;
  const showWeights = graph.weighted && graph.edges.length <= 220;

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${stripsApart ? bandHeight(bottom, snapshot.strips.length) : VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full select-none"
      role="img"
      aria-label={`Graph of ${counted(graph.nodes.length, 'node')} and ${counted(graph.edges.length, 'edge')}`}
    >
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
        <marker id="link-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
      </defs>

      {/* closed components, under everything else */}
      {outlines.map((outline) =>
        outline.mode === 'outline' ? (
          <g key={`component-${outline.id}`}>
            <path
              d={`${outline.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} Z`}
              fill="none"
              stroke="var(--viz-text-dim)"
              strokeWidth={1.25}
              strokeLinejoin="round"
            />
            <text
              x={outline.tag.x}
              y={outline.tag.y + 11}
              textAnchor="middle"
              fontSize={9.5}
              fontWeight={600}
              fill="var(--viz-text-dim)"
              stroke="var(--viz-bg)"
              strokeWidth={3}
              paintOrder="stroke"
              className="font-mono"
            >
              {outline.id}
            </text>
          </g>
        ) : null,
      )}

      {geometry.edges.map((edge) => {
        const role = roles.get(`edge:${edge.id}`);
        const tree = treeEdges.has(edge.id);
        const stroke = role !== undefined ? ROLE_COLOR[role] : tree ? 'var(--viz-active)' : 'var(--viz-grid)';
        const width = role !== undefined ? 3.5 : tree ? 2.5 : 1.4;
        return (
          <g key={edge.id}>
            {edge.curve === null ? (
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
            ) : (
              <path
                d={`M ${edge.x1} ${edge.y1} Q ${edge.curve.x} ${edge.curve.y} ${edge.x2} ${edge.y2}`}
                fill="none"
                stroke={stroke}
                strokeWidth={width}
                strokeOpacity={role === undefined && !tree ? 0.9 : 1}
                markerEnd="url(#arrow)"
                style={{ transition: paint }}
              />
            )}
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
            style={{ transition: animate ? `d ${ms}ms var(--ease-slide), ${paint}` : 'none' }}
          />
        );
      })}

      {graph.nodes.map((node) => {
        const placed = geometry.positions.get(node.id);
        if (placed === undefined) return null;
        const role = roles.get(node.id);
        const fillName: FillName = role ?? (visited.has(node.id) ? 'visited' : 'default');
        const mark = markFor(role);
        const stroke = mark === null ? null : circleMark(mark, radius);
        const fill = role !== undefined ? ROLE_COLOR[role] : visited.has(node.id) ? 'var(--viz-visited)' : 'var(--viz-default)';
        const tags = labels.get(node.id);
        const label = snapshot.labels[node.id];
        return (
          <g key={node.id} transform={`translate(${placed.x} ${placed.y})`}>
            <circle r={radius} fill={fill} stroke="var(--viz-bg)" strokeWidth={1.5} style={{ transition: paint }} />
            {stroke !== null && (
              <circle
                r={stroke.radius}
                fill="none"
                stroke={ink[fillName]}
                strokeWidth={stroke.width}
                strokeDasharray={stroke.dash}
              />
            )}
            {showText && (
              <text
                y={radius * 0.36}
                textAnchor="middle"
                fontSize={Math.min(11, radius * 0.95)}
                fontWeight={600}
                fill={ink[fillName]}
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
            {nodeTags.has(node.id) && (
              <text
                x={radius * 0.75}
                y={radius + 10}
                fontSize={radius >= 10 ? 9.5 : 8}
                fontWeight={600}
                fill="var(--viz-text-dim)"
                stroke="var(--viz-bg)"
                strokeWidth={3}
                paintOrder="stroke"
                className="font-mono"
              >
                {nodeTags.get(node.id)}
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

      {!stripsApart && snapshot.strips.map((strip, row) => (
        <StripRow key={strip.label} strip={strip} y={bottom + 12 + row * STRIP_HEIGHT} roles={roles} transition={animate ? `transform ${ms}ms var(--ease-slide)` : 'none'} animate={animate} ink={ink} />
      ))}
    </svg>
  );
}

export const GraphRenderer = memo(GraphRendererImpl);
