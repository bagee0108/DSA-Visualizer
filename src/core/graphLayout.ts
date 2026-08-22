/** Graph layout, computed once per run: a deterministic force-directed pass, a ring, or a lattice. */

export type LayoutKind = 'auto' | 'ring' | 'grid';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type EdgePair = readonly [number, number];

/** Width : height of the box positions are laid out in; the canvas is about this wide. */
export const LAYOUT_ASPECT = 3.2;
const PAD = 0.04;
const ITERATIONS = 260;
const GRAVITY = 0.3;

export function gridColumns(nodeCount: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(nodeCount * LAYOUT_ASPECT)));
}

function ring(nodeCount: number): Point[] {
  const height = 1 / LAYOUT_ASPECT;
  const radius = (height / 2) * 0.88;
  return Array.from({ length: nodeCount }, (_, i) => {
    const angle = (2 * Math.PI * i) / nodeCount - Math.PI / 2;
    return { x: 0.5 + radius * Math.cos(angle), y: height / 2 + radius * Math.sin(angle) };
  });
}

function grid(nodeCount: number): Point[] {
  const cols = gridColumns(nodeCount);
  const rows = Math.ceil(nodeCount / cols);
  const height = 1 / LAYOUT_ASPECT;
  const stepX = cols === 1 ? 0 : (1 - 2 * PAD) / (cols - 1);
  const stepY = rows === 1 ? 0 : (height - 2 * PAD) / (rows - 1);
  const step = Math.min(stepX || Number.POSITIVE_INFINITY, stepY || Number.POSITIVE_INFINITY);
  const cell = Number.isFinite(step) ? step : 0;
  const x0 = 0.5 - (cell * (cols - 1)) / 2;
  const y0 = height / 2 - (cell * (rows - 1)) / 2;
  return Array.from({ length: nodeCount }, (_, i) => ({ x: x0 + (i % cols) * cell, y: y0 + Math.floor(i / cols) * cell }));
}

function fit(points: readonly Point[]): Point[] {
  if (points.length === 0) return [];
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const height = 1 / LAYOUT_ASPECT;
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const scale = Math.min((1 - 2 * PAD) / spanX, (height - 2 * PAD) / spanY);
  const offsetX = 0.5 - (scale * spanX) / 2;
  const offsetY = height / 2 - (scale * spanY) / 2;
  return points.map((p) => ({ x: offsetX + (p.x - minX) * scale, y: offsetY + (p.y - minY) * scale }));
}

function forceDirected(nodeCount: number, edges: readonly EdgePair[]): Point[] {
  if (nodeCount <= 2) return ring(nodeCount);
  const height = 1 / LAYOUT_ASPECT;
  const k = 1.1 * Math.sqrt((1 * height) / nodeCount);
  // Repulsion is short range (the grid variant of Fruchterman-Reingold): beyond
  // a few k it is zero, so a big graph does not push itself onto the frame.
  const cutoff = 2.5 * k;
  const xs = ring(nodeCount).map((p) => p.x);
  const ys = ring(nodeCount).map((p) => p.y);
  const clamp = (value: number, high: number): number => (value < PAD ? PAD : value > high - PAD ? high - PAD : value);
  const dx = new Float64Array(nodeCount);
  const dy = new Float64Array(nodeCount);

  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    const temperature = 0.12 * (1 - iteration / ITERATIONS) + 0.001;
    dx.fill(0);
    dy.fill(0);

    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        let ex = (xs[i] ?? 0) - (xs[j] ?? 0);
        let ey = (ys[i] ?? 0) - (ys[j] ?? 0);
        let d = Math.hypot(ex, ey);
        if (d >= cutoff) continue;
        if (d < 1e-6) {
          ex = 1e-4 * (i + 1);
          ey = 1e-4 * (j + 1);
          d = Math.hypot(ex, ey);
        }
        const force = (k * k) / d;
        const fx = (ex / d) * force;
        const fy = (ey / d) * force;
        dx[i] = (dx[i] ?? 0) + fx;
        dy[i] = (dy[i] ?? 0) + fy;
        dx[j] = (dx[j] ?? 0) - fx;
        dy[j] = (dy[j] ?? 0) - fy;
      }
    }

    for (const [a, b] of edges) {
      if (a === b) continue;
      const ex = (xs[a] ?? 0) - (xs[b] ?? 0);
      const ey = (ys[a] ?? 0) - (ys[b] ?? 0);
      const d = Math.hypot(ex, ey);
      if (d < 1e-9) continue;
      const force = (d * d) / k;
      const fx = (ex / d) * force;
      const fy = (ey / d) * force;
      dx[a] = (dx[a] ?? 0) - fx;
      dy[a] = (dy[a] ?? 0) - fy;
      dx[b] = (dx[b] ?? 0) + fx;
      dy[b] = (dy[b] ?? 0) + fy;
    }

    for (let i = 0; i < nodeCount; i++) {
      // Gravity keeps disconnected components in the frame.
      const gx = 0.5 - (xs[i] ?? 0);
      const gy = height / 2 - (ys[i] ?? 0);
      const vx = (dx[i] ?? 0) + gx * GRAVITY;
      const vy = (dy[i] ?? 0) + gy * GRAVITY;
      const speed = Math.hypot(vx, vy);
      if (speed < 1e-12) continue;
      const step = Math.min(speed, temperature);
      // Stay inside the box, so disconnected components settle at its edges instead of flying off.
      xs[i] = clamp((xs[i] ?? 0) + (vx / speed) * step, 1);
      ys[i] = clamp((ys[i] ?? 0) + (vy / speed) * step, height);
    }
  }

  return fit(xs.map((x, i) => ({ x, y: ys[i] ?? 0 })));
}

export function layoutGraph(nodeCount: number, edges: readonly EdgePair[], kind: LayoutKind): Point[] {
  if (nodeCount === 0) return [];
  if (nodeCount === 1) return [{ x: 0.5, y: 1 / LAYOUT_ASPECT / 2 }];
  switch (kind) {
    case 'ring':
      return ring(nodeCount);
    case 'grid':
      return grid(nodeCount);
    case 'auto':
      return forceDirected(nodeCount, edges);
  }
}
