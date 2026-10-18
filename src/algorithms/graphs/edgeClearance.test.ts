/**
 * Layout invariant: no edge, as drawn, passes within a node radius plus 2 view
 * units of a node that is not one of its endpoints. An edge under a third node
 * reads as two edges through it. Checked on every preset of every graph level.
 */

import { describe, expect, it } from 'vitest';

import type { RegisteredAlgorithm } from '../../core/define';
import { makeRng } from '../../core/random';
import { graphBandBottom, graphGeometry } from '../../renderers/GraphRenderer';
import { graphOf } from '../frameHygiene';
import { bfs } from './bfs';
import { dfs } from './dfs';
import { dijkstra } from './dijkstra';
import { tarjanScc } from './tarjan';
import { unionFind } from './unionFind';

const LEVELS: readonly RegisteredAlgorithm[] = [bfs, dfs, dijkstra, unionFind, tarjanScc];
const SIZES = [6, 12, 40, 150] as const;
/** Clearance beyond the rim, in view units. */
const CLEARANCE = 2;
/** Points per quadratic curve; the polyline stays within a fraction of a unit of the curve. */
const CURVE_STEPS = 48;

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

/** The edge as drawn: its trimmed straight segment, or its quadratic curve as a fine polyline. */
function drawnPath(edge: ReturnType<typeof graphGeometry>['edges'][number]): Point[] {
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

interface ClearanceCase {
  readonly level: string;
  readonly preset: string;
  readonly size: number;
  readonly layout: string;
  /** Edge/node pairs closer than radius + CLEARANCE. */
  readonly violations: number;
  /** Closest two node centres, in view units, against a diameter plus CLEARANCE. */
  readonly minGap: number;
  readonly needGap: number;
}

function clearanceCases(): ClearanceCase[] {
  const out: ClearanceCase[] = [];
  for (const level of LEVELS) {
    for (const preset of level.presets) {
      for (const size of SIZES) {
        const params = preset.build(size, makeRng(size * 101 + 7));
        const built = level.build(params);
        if (!built.ok) throw new Error(`${level.meta.id}/${preset.id}@${size}: ${built.error}`);
        const first = graphOf(built.frames[0]);
        const geometry = graphGeometry(first.graph, graphBandBottom(first.strips.length));
        const limit = geometry.radius + CLEARANCE;
        let violations = 0;
        for (const edge of geometry.edges) {
          const path = drawnPath(edge);
          for (const [id, at] of geometry.positions) {
            if (id === edge.from || id === edge.to) continue;
            let nearest = Number.POSITIVE_INFINITY;
            for (let i = 1; i < path.length && nearest >= limit; i++) nearest = Math.min(nearest, segmentDistance(at, path[i - 1] as Point, path[i] as Point));
            if (nearest < limit) violations += 1;
          }
        }
        const placed = [...geometry.positions.values()];
        let minGap = Number.POSITIVE_INFINITY;
        for (let i = 0; i < placed.length; i++) {
          for (let j = i + 1; j < placed.length; j++) {
            const p = placed[i] as Point;
            const q = placed[j] as Point;
            minGap = Math.min(minGap, Math.hypot(p.x - q.x, p.y - q.y));
          }
        }
        out.push({ level: level.meta.id, preset: preset.id, size, layout: params.layout ?? 'auto', violations, minGap, needGap: 2 * geometry.radius + CLEARANCE });
      }
    }
  }
  return out;
}

describe('graph layout: edge clearance', () => {
  // Was 41 of 100 cases and 2488 edge/node pairs on the clamped layout (08c298d).
  // CLEARANCE_REPORT=1 prints the per-case table.
  let cached: ClearanceCase[] | null = null;
  const rows = (): ClearanceCase[] => (cached ??= clearanceCases());

  it('keeps every edge clear of every node it does not join, on every preset of every graph level', () => {
    if (import.meta.env.CLEARANCE_REPORT !== undefined) {
      console.log(['level preset size violations minGap', ...rows().map((row) => `${row.level} ${row.preset} ${row.size} ${row.violations} ${row.minGap.toFixed(2)}`)].join('\n'));
    }
    const failing = rows().filter((row) => row.violations > 0);
    expect(failing).toEqual([]);
  }, 120000);

  it('keeps nodes a diameter plus the clearance apart in every layout, so none hides another', () => {
    // Ring presets are capped (RING_MAX_NODES) so a ring can hold this spacing too.
    const crowded = rows().filter((row) => row.minGap < row.needGap);
    expect(crowded).toEqual([]);
  }, 120000);
});
