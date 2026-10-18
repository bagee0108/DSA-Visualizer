/** Graph layout, computed once per run: a deterministic force-directed pass, a ring, or a lattice. */

export type LayoutKind = 'auto' | 'ring' | 'grid';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type EdgePair = readonly [number, number];

/**
 * Width : height of the box positions are laid out in. It tracks the canvas band
 * the renderer fits that box into (about 968 x 452 above one strip row), because
 * a box wider than the band is letterboxed inside it and the height is wasted.
 */
export const LAYOUT_ASPECT = 2.2;
const PAD = 0.04;
const ITERATIONS = 260;
const GRAVITY = 0.3;
/** Pull back, per unit of overshoot, on a node that drifts past the padding. Soft, so nodes never pile up in rows on the edge. */
const BOUNDARY = 4;
/** Most the fit may stretch one axis past the other, so a round result still spans the wide box without looking squashed. */
const MAX_STRETCH = 1.6;

/** Node radius in view units for a graph of this size; the renderer draws exactly this. */
export function nodeRadius(nodeCount: number): number {
  return nodeCount <= 12 ? 16 : nodeCount <= 30 ? 13 : nodeCount <= 60 ? 10 : nodeCount <= 100 ? 8 : 6.5;
}

/**
 * The fewest view units the renderer ever spends on the layout box's unit
 * width: the band above two strip rows. Graph levels draw at most two, and
 * canvasFit.test.ts holds the renderer to this.
 */
export const LAYOUT_MIN_VIEW_SCALE = 893;
/** View units an edge keeps clear of a node's rim when it does not join that node. */
export const EDGE_CLEARANCE = 2;
/** Extra margin the repair pass keeps, so rounding in the renderer cannot undo it. */
const REPAIR_SLACK = 1;
const REPAIR_ROUNDS = 5;
/** Rounds of the second phase, where an edge also gives way, for nodes caught between edges on both sides. */
const SHARED_ROUNDS = 60;
/** The renderer's bow for one edge of a two-way pair: its peak offset from the chord, in view units. */
const BOW_MAX = 14;
const BOW_SHARE = 0.2;

export function gridColumns(nodeCount: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(nodeCount * LAYOUT_ASPECT)));
}

/** Points on the circle the force-directed pass starts from. */
function circleSeed(nodeCount: number): Point[] {
  const height = 1 / LAYOUT_ASPECT;
  const radius = (height / 2) * 0.88;
  return Array.from({ length: nodeCount }, (_, i) => {
    const angle = (2 * Math.PI * i) / nodeCount - Math.PI / 2;
    return { x: 0.5 + radius * Math.cos(angle), y: height / 2 + radius * Math.sin(angle) };
  });
}

/** Samples per turn for the arc-length table; the spacing error is far below a view unit. */
const ARC_SAMPLES = 2048;

/**
 * An ellipse spanning the box, nodes an equal ARC LENGTH apart, starting at the
 * top and going clockwise. Equal angles would bunch them at the ends of the
 * long axis, where the curve turns fastest.
 */
function ring(nodeCount: number): Point[] {
  const height = 1 / LAYOUT_ASPECT;
  const a = 0.5 - PAD;
  const b = height / 2 - PAD;
  const at = (t: number): Point => ({ x: 0.5 + a * Math.cos(t), y: height / 2 + b * Math.sin(t) });
  const start = -Math.PI / 2;
  // Cumulative length at each sample; lengths[k] is the arc from the start to sample k.
  const lengths = new Float64Array(ARC_SAMPLES + 1);
  let previous = at(start);
  for (let k = 1; k <= ARC_SAMPLES; k++) {
    const next = at(start + (2 * Math.PI * k) / ARC_SAMPLES);
    lengths[k] = (lengths[k - 1] ?? 0) + Math.hypot(next.x - previous.x, next.y - previous.y);
    previous = next;
  }
  const total = lengths[ARC_SAMPLES] ?? 0;
  const out: Point[] = [];
  let k = 0;
  for (let i = 0; i < nodeCount; i++) {
    const target = (total * i) / nodeCount;
    while (k < ARC_SAMPLES && (lengths[k + 1] ?? 0) < target) k += 1;
    const from = lengths[k] ?? 0;
    const span = (lengths[k + 1] ?? from) - from;
    const fraction = span > 0 ? (target - from) / span : 0;
    out.push(at(start + (2 * Math.PI * (k + fraction)) / ARC_SAMPLES));
  }
  return out;
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
  const fillX = (1 - 2 * PAD) / spanX;
  const fillY = (height - 2 * PAD) / spanY;
  const scale = Math.min(fillX, fillY);
  // Then stretch the slack axis toward the box edge, by at most MAX_STRETCH. A stretch of 1 or more
  // never brings two points, or a point and an edge, closer, so it costs no clearance.
  const scaleX = Math.min(fillX, scale * MAX_STRETCH);
  const scaleY = Math.min(fillY, scale * MAX_STRETCH);
  const offsetX = 0.5 - (scaleX * spanX) / 2;
  const offsetY = height / 2 - (scaleY * spanY) / 2;
  return points.map((p) => ({ x: offsetX + (p.x - minX) * scaleX, y: offsetY + (p.y - minY) * scaleY }));
}

function forceDirected(nodeCount: number, edges: readonly EdgePair[]): Point[] {
  if (nodeCount <= 2) return circleSeed(nodeCount);
  const height = 1 / LAYOUT_ASPECT;
  const k = 1.1 * Math.sqrt((1 * height) / nodeCount);
  // Repulsion is short range (the grid variant of Fruchterman-Reingold): beyond
  // a few k it is zero, so a big graph does not push itself onto the frame.
  const cutoff = 2.5 * k;
  const seed = circleSeed(nodeCount);
  const xs = seed.map((p) => p.x);
  const ys = seed.map((p) => p.y);
  const pullBack = (value: number, high: number): number => (value < PAD ? PAD - value : value > high - PAD ? high - PAD - value : 0);
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
        // Most pairs are far apart on one axis; skip them before the square root.
        if (ex >= cutoff || ex <= -cutoff || ey >= cutoff || ey <= -cutoff) continue;
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
      // Weaker sideways, by the box's aspect, so a graph spreads to the wide box instead of settling round.
      const vx = (dx[i] ?? 0) + gx * GRAVITY + pullBack(xs[i] ?? 0, 1) * BOUNDARY;
      const vy = (dy[i] ?? 0) + gy * GRAVITY + pullBack(ys[i] ?? 0, height) * BOUNDARY;
      const speed = Math.hypot(vx, vy);
      if (speed < 1e-12) continue;
      const step = Math.min(speed, temperature);
      xs[i] = (xs[i] ?? 0) + (vx / speed) * step;
      ys[i] = (ys[i] ?? 0) + (vy / speed) * step;
    }
  }

  return repair(fit(xs.map((x, i) => ({ x, y: ys[i] ?? 0 }))), edges);
}

/**
 * Moves any node that sits within clearance of an edge it is not on, straight
 * away from that edge, until none does or the rounds run out. Works in the
 * final box at the smallest scale the renderer draws, measured to the full
 * centre-to-centre segment (the drawn edge is shorter), plus the bow for an
 * edge of a two-way pair. Deterministic: nodes and edges in index order.
 *
 * A node caught in a pocket narrower than twice the clearance, with edges on
 * both sides, only bounces between them. So a second phase splits each push:
 * the node takes half, and the edge's endpoints take the other half the
 * opposite way, weighted by where along the edge the node sits.
 */
function repair(points: Point[], edges: readonly EdgePair[]): Point[] {
  const n = points.length;
  const height = 1 / LAYOUT_ASPECT;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const base = (nodeRadius(n) + EDGE_CLEARANCE + REPAIR_SLACK) / LAYOUT_MIN_VIEW_SCALE;
  const apart = (2 * nodeRadius(n) + EDGE_CLEARANCE + REPAIR_SLACK) / LAYOUT_MIN_VIEW_SCALE;
  const keys = new Set(edges.map(([a, b]) => `${a}>${b}`));
  const seen = new Set<string>();
  const list = edges.filter(([a, b]) => {
    if (a === b) return false;
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    const twoWay = keys.has(`${b}>${a}`);
    // A two-way pair is two curves either side of one chord; check the chord once, widened by the bow.
    if (twoWay && seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const twoWay = list.map(([a, b]) => keys.has(`${b}>${a}`));
  const inside = (value: number, high: number): number => Math.min(high - PAD, Math.max(PAD, value));

  for (let round = 0; round < REPAIR_ROUNDS + SHARED_ROUNDS; round++) {
    const shared = round >= REPAIR_ROUNDS;
    let moved = false;
    // Nodes on top of each other read as one; hold them a diameter plus the clearance apart, each giving half.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = (xs[j] ?? 0) - (xs[i] ?? 0);
        const dy = (ys[j] ?? 0) - (ys[i] ?? 0);
        if (Math.abs(dx) >= apart || Math.abs(dy) >= apart) continue;
        const d = Math.hypot(dx, dy);
        if (d >= apart) continue;
        const ux = d > 1e-12 ? dx / d : 1;
        const uy = d > 1e-12 ? dy / d : 0;
        const half = (apart - d + 1e-6) / 2;
        xs[i] = inside((xs[i] ?? 0) - ux * half, 1);
        ys[i] = inside((ys[i] ?? 0) - uy * half, height);
        xs[j] = inside((xs[j] ?? 0) + ux * half, 1);
        ys[j] = inside((ys[j] ?? 0) + uy * half, height);
        moved = true;
      }
    }
    for (let e = 0; e < list.length; e++) {
      const [a, b] = list[e] ?? [0, 0];
      const ax = xs[a] ?? 0;
      const ay = ys[a] ?? 0;
      const ex = (xs[b] ?? 0) - ax;
      const ey = (ys[b] ?? 0) - ay;
      const length2 = ex * ex + ey * ey;
      if (length2 < 1e-18) continue;
      const length = Math.sqrt(length2);
      const bow = twoWay[e] === true ? Math.min(BOW_MAX, BOW_SHARE * length * LAYOUT_MIN_VIEW_SCALE) / LAYOUT_MIN_VIEW_SCALE : 0;
      const need = base + bow;
      // Only nodes inside the edge's box, grown by the clearance, can be near it.
      const left = Math.min(ax, ax + ex) - need;
      const right = Math.max(ax, ax + ex) + need;
      const top = Math.min(ay, ay + ey) - need;
      const bottom = Math.max(ay, ay + ey) + need;
      for (let w = 0; w < n; w++) {
        const wx = xs[w] ?? 0;
        const wy = ys[w] ?? 0;
        if (wx < left || wx > right || wy < top || wy > bottom || w === a || w === b) continue;
        const px = wx - ax;
        const py = wy - ay;
        const t = Math.max(0, Math.min(1, (px * ex + py * ey) / length2));
        const ox = px - t * ex;
        const oy = py - t * ey;
        const d = Math.hypot(ox, oy);
        if (d >= need) continue;
        // Away from the nearest point of the edge; on the line itself, to the edge's left.
        let ux = d > 1e-12 ? ox / d : -ey / length;
        let uy = d > 1e-12 ? oy / d : ex / length;
        const push = (need - d + 1e-6) * (shared ? 0.5 : 1);
        if (shared) {
          // The edge gives way too, the other half, opposite the node.
          xs[a] = inside((xs[a] ?? 0) - ux * push * (1 - t), 1);
          ys[a] = inside((ys[a] ?? 0) - uy * push * (1 - t), height);
          xs[b] = inside((xs[b] ?? 0) - ux * push * t, 1);
          ys[b] = inside((ys[b] ?? 0) - uy * push * t, height);
        }
        let nx = inside((xs[w] ?? 0) + ux * push, 1);
        let ny = inside((ys[w] ?? 0) + uy * push, height);
        if (Math.hypot(nx - (xs[w] ?? 0), ny - (ys[w] ?? 0)) < push * 0.5) {
          // The box blocks that side: cross to the other side of the edge instead.
          ux = -ux;
          uy = -uy;
          const across = need + d + 1e-6;
          nx = inside((xs[w] ?? 0) + ux * across, 1);
          ny = inside((ys[w] ?? 0) + uy * across, height);
        }
        xs[w] = nx;
        ys[w] = ny;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return xs.map((x, i) => ({ x, y: ys[i] ?? 0 }));
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
