import { describe, expect, it } from 'vitest';

import { LAYOUT_ASPECT, gridColumns, layoutGraph, type EdgePair } from './graphLayout';
import { makeRng, randomInt } from './random';

const HEIGHT = 1 / LAYOUT_ASPECT;

function randomEdges(nodeCount: number, count: number, seed: number): EdgePair[] {
  const rng = makeRng(seed);
  const out: EdgePair[] = [];
  for (let i = 1; i < nodeCount; i++) out.push([randomInt(rng, 0, i - 1), i]);
  while (out.length < count) out.push([randomInt(rng, 0, nodeCount - 1), randomInt(rng, 0, nodeCount - 1)]);
  return out;
}

function inBox(points: readonly { x: number; y: number }[]): boolean {
  return points.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= HEIGHT + 1e-9);
}

describe('graph layout', () => {
  it('puts a ring on one ellipse spanning the box, spaced by equal arc length', () => {
    const points = layoutGraph(150, [], 'ring');
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const a = (Math.max(...xs) - Math.min(...xs)) / 2;
    const b = (Math.max(...ys) - Math.min(...ys)) / 2;
    // Wider than tall, and filling most of the box both ways.
    expect(a).toBeGreaterThan(0.45);
    expect(b).toBeGreaterThan(HEIGHT * 0.4);
    for (const p of points) expect(((p.x - 0.5) / a) ** 2 + ((p.y - HEIGHT / 2) / b) ** 2).toBeCloseTo(1, 2);
    // Neighbour chords are all within 1% of each other; equal angles would vary several-fold.
    const gaps = points.map((p, i) => {
      const q = points[(i + 1) % points.length] ?? p;
      return Math.hypot(q.x - p.x, q.y - p.y);
    });
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(1.01);
    expect(points[0]?.x).toBeCloseTo(0.5, 9);
    expect(points[0]?.y ?? 1).toBeLessThan(HEIGHT / 2);
    expect(inBox(points)).toBe(true);
  });

  it('lays a lattice out row by row with one square cell size', () => {
    const n = 20;
    const cols = gridColumns(n);
    const points = layoutGraph(n, [], 'grid');
    const cell = (points[1]?.x ?? 0) - (points[0]?.x ?? 0);
    expect(cell).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      if (p === undefined) throw new Error('missing point');
      expect(p.x).toBeCloseTo((points[0]?.x ?? 0) + (i % cols) * cell, 9);
      expect(p.y).toBeCloseTo((points[0]?.y ?? 0) + Math.floor(i / cols) * cell, 9);
    }
    expect(inBox(points)).toBe(true);
  });

  it('is deterministic and stays inside the box for force-directed layouts', () => {
    for (const n of [3, 12, 150]) {
      const edges = randomEdges(n, Math.round(n * 1.6), n);
      const a = layoutGraph(n, edges, 'auto');
      const b = layoutGraph(n, edges, 'auto');
      expect(a).toEqual(b);
      expect(a).toHaveLength(n);
      expect(inBox(a)).toBe(true);
    }
  });

  it('keeps every node apart and pulls neighbours closer than strangers', () => {
    const n = 60;
    const edges = randomEdges(n, 90, 7);
    const points = layoutGraph(n, edges, 'auto');
    let minGap = Number.POSITIVE_INFINITY;
    let strangerSum = 0;
    let strangerCount = 0;
    const adjacent = new Set(edges.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = Math.hypot((points[i]?.x ?? 0) - (points[j]?.x ?? 0), (points[i]?.y ?? 0) - (points[j]?.y ?? 0));
        if (d < minGap) minGap = d;
        if (!adjacent.has(`${i}-${j}`)) {
          strangerSum += d;
          strangerCount += 1;
        }
      }
    }
    let neighbourSum = 0;
    for (const [a, b] of edges) {
      neighbourSum += Math.hypot((points[a]?.x ?? 0) - (points[b]?.x ?? 0), (points[a]?.y ?? 0) - (points[b]?.y ?? 0));
    }
    expect(minGap).toBeGreaterThan(0.005);
    expect(neighbourSum / edges.length).toBeLessThan(strangerSum / strangerCount);
  });

  it('handles the degenerate sizes', () => {
    expect(layoutGraph(0, [], 'auto')).toEqual([]);
    expect(layoutGraph(1, [], 'auto')).toHaveLength(1);
    expect(layoutGraph(2, [[0, 1]], 'auto')).toHaveLength(2);
    expect(layoutGraph(1, [], 'grid')).toHaveLength(1);
  });
});
