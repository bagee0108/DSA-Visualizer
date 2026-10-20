/**
 * How well a laid-out graph keeps its edges off nodes they do not join. An edge
 * that passes under a third node reads as two edges through it. Measured on
 * the edges as drawn: the trimmed straight segment, or the curve of one edge
 * of a two-way pair.
 */

import type { graphGeometry } from './GraphRenderer';

/** Clearance beyond a node's rim, in view units, that an edge it does not join must keep. */
export const EDGE_CLEARANCE_VIEW = 2;
/** Points per quadratic curve; the polyline stays within a fraction of a unit of the curve. */
const CURVE_STEPS = 48;

type Geometry = ReturnType<typeof graphGeometry>;
type DrawnEdge = Geometry['edges'][number];

interface Point {
  readonly x: number;
  readonly y: number;
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function drawnPath(edge: DrawnEdge): Point[] {
  const start = { x: edge.x1, y: edge.y1 };
  const end = { x: edge.x2, y: edge.y2 };
  if (edge.curve === null) return [start, end];
  const c = edge.curve;
  return Array.from({ length: CURVE_STEPS + 1 }, (_, i) => {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    return { x: u * u * start.x + 2 * u * t * c.x + t * t * end.x, y: u * u * start.y + 2 * u * t * c.y + t * t * end.y };
  });
}

export interface Clearance {
  /** Edge/node pairs closer than the node radius plus EDGE_CLEARANCE_VIEW. */
  readonly pairs: number;
  /** Distinct edges in at least one such pair. */
  readonly edges: number;
}

export function clearanceOf(geometry: Pick<Geometry, 'positions' | 'radius' | 'edges'>): Clearance {
  const limit = geometry.radius + EDGE_CLEARANCE_VIEW;
  let pairs = 0;
  let edges = 0;
  for (const edge of geometry.edges) {
    const path = drawnPath(edge);
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const p of path) {
      left = Math.min(left, p.x);
      right = Math.max(right, p.x);
      top = Math.min(top, p.y);
      bottom = Math.max(bottom, p.y);
    }
    let hit = false;
    for (const [id, at] of geometry.positions) {
      if (id === edge.from || id === edge.to) continue;
      if (at.x < left - limit || at.x > right + limit || at.y < top - limit || at.y > bottom + limit) continue;
      let nearest = Number.POSITIVE_INFINITY;
      for (let i = 1; i < path.length && nearest >= limit; i++) nearest = Math.min(nearest, segmentDistance(at, path[i - 1] as Point, path[i] as Point));
      if (nearest < limit) {
        pairs += 1;
        hit = true;
      }
    }
    if (hit) edges += 1;
  }
  return { pairs, edges };
}

/** Closest two node centres, in view units. */
export function minNodeGap(geometry: Pick<Geometry, 'positions'>): number {
  const placed = [...geometry.positions.values()];
  let gap = Number.POSITIVE_INFINITY;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const p = placed[i] as Point;
      const q = placed[j] as Point;
      gap = Math.min(gap, Math.hypot(p.x - q.x, p.y - q.y));
    }
  }
  return gap;
}

/**
 * The notice under the canvas when edges, as drawn, pass within the clearance
 * of nodes they do not join, or null when none do. A user-entered graph can lay
 * out that way; so can a preset that used up its tries (see regenerating()).
 */
export function clearanceNotice({ pairs, edges }: Clearance): string | null {
  if (edges === 0) return null;
  if (edges === 1) return `1 edge passes close to ${pairs === 1 ? 'a node' : 'nodes'} it does not connect to in this layout.`;
  return `${edges} edges pass close to nodes they do not connect to in this layout.`;
}
