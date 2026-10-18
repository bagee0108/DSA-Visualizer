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
/** Passes over the pairs still stuck after those rounds, each moving a node to a free spot, then a short clean-up. */
const RELOCATE_ATTEMPTS = 3;
const CLEANUP_ROUNDS = 10;
/** Rings, and points per ring, tried around a stuck node's neighbours and around its own position. */
const RELOCATE_RINGS = 12;
const RELOCATE_ANGLES = 16;
/** Width of a node-grid cell, in layout units. */
const GRID_CELL = 0.04;
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

/**
 * The most nodes a ring layout holds with neighbours a diameter plus the edge
 * clearance apart, at the smallest scale the renderer draws, up to `limit`.
 */
export function ringMaxNodes(limit: number): number {
  for (let n = limit; n > 2; n--) {
    const points = ring(n);
    let closest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      const p = points[i] as Point;
      const q = points[(i + 1) % n] as Point;
      closest = Math.min(closest, Math.hypot(q.x - p.x, q.y - p.y));
    }
    if (closest * LAYOUT_MIN_VIEW_SCALE >= 2 * nodeRadius(n) + EDGE_CLEARANCE) return n;
  }
  return Math.min(limit, 2);
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
 * opposite way, weighted by where along the edge the node sits. If nodes are
 * still stuck after that, each is moved to the nearest free spot (see
 * relocate), or one end of the edge if the node has nowhere to go, a few
 * passes at most.
 *
 * A grid of node positions, kept current as nodes move, finds the nodes near an
 * edge without scanning them all; they are visited in index order, so the
 * result is the same as the full scan.
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
  const radiusView = nodeRadius(n);
  /**
   * How far the drawn edge strays from its chord, plus the clearance. A two-way
   * edge is drawn as a quadratic whose control point sits twice the bow off the
   * chord's middle, with each end trimmed toward that control point (by the
   * radius + 1 at the start and + 5 at the arrowhead), so its peak is the
   * midpoint of those three points, a little past the bow itself.
   */
  const needFor = (e: number, length: number): number => {
    if (twoWay[e] !== true) return base;
    const lengthView = length * LAYOUT_MIN_VIEW_SCALE;
    const control = 2 * Math.min(BOW_MAX, BOW_SHARE * lengthView);
    const sine = control / (Math.hypot(control, lengthView / 2) || 1);
    const peak = 0.5 * control + 0.25 * (radiusView + 1) * sine + 0.25 * (radiusView + 5) * sine;
    return base + peak / LAYOUT_MIN_VIEW_SCALE;
  };

  // The node grid. Cells are GRID_CELL wide; a node's cell is updated whenever it moves.
  const cols = Math.ceil(1 / GRID_CELL) + 1;
  const rows = Math.ceil(height / GRID_CELL) + 1;
  const cells: number[][] = Array.from({ length: cols * rows }, () => []);
  const cellOfNode = new Int32Array(n);
  const cellAt = (x: number, y: number): number =>
    Math.min(rows - 1, Math.max(0, Math.floor(y / GRID_CELL))) * cols + Math.min(cols - 1, Math.max(0, Math.floor(x / GRID_CELL)));
  for (let i = 0; i < n; i++) {
    const c = cellAt(xs[i] ?? 0, ys[i] ?? 0);
    cellOfNode[i] = c;
    cells[c]?.push(i);
  }
  const place = (i: number, x: number, y: number): void => {
    xs[i] = x;
    ys[i] = y;
    const c = cellAt(x, y);
    const old = cellOfNode[i] ?? 0;
    if (c === old) return;
    const from = cells[old] ?? [];
    from.splice(from.indexOf(i), 1);
    cells[c]?.push(i);
    cellOfNode[i] = c;
  };
  /** Nodes whose cell overlaps the box, in index order. */
  const nodesIn = (left: number, top: number, right: number, bottom: number): number[] => {
    const found: number[] = [];
    const c0 = Math.max(0, Math.floor(left / GRID_CELL));
    const c1 = Math.min(cols - 1, Math.floor(right / GRID_CELL));
    const r0 = Math.max(0, Math.floor(top / GRID_CELL));
    const r1 = Math.min(rows - 1, Math.floor(bottom / GRID_CELL));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) found.push(...(cells[r * cols + c] ?? []));
    return found.sort((p, q) => p - q);
  };

  /** Whether any node in the cells overlapping the box passes the test; no allocation, no order. */
  const anyNodeIn = (left: number, top: number, right: number, bottom: number, test: (v: number) => boolean): boolean => {
    const c0 = Math.max(0, Math.floor(left / GRID_CELL));
    const c1 = Math.min(cols - 1, Math.floor(right / GRID_CELL));
    const r0 = Math.max(0, Math.floor(top / GRID_CELL));
    const r1 = Math.min(rows - 1, Math.floor(bottom / GRID_CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (const v of cells[r * cols + c] ?? []) if (test(v)) return true;
      }
    }
    return false;
  };

  /** One pass over node pairs, then every edge. Returns whether anything moved. */
  const round = (shared: boolean): boolean => {
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
        place(i, inside((xs[i] ?? 0) - ux * half, 1), inside((ys[i] ?? 0) - uy * half, height));
        place(j, inside((xs[j] ?? 0) + ux * half, 1), inside((ys[j] ?? 0) + uy * half, height));
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
      const need = needFor(e, length);
      // Only nodes inside the edge's box, grown by the clearance, can be near it.
      const left = Math.min(ax, ax + ex) - need;
      const right = Math.max(ax, ax + ex) + need;
      const top = Math.min(ay, ay + ey) - need;
      const bottom = Math.max(ay, ay + ey) + need;
      for (const w of nodesIn(left, top, right, bottom)) {
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
          place(a, inside((xs[a] ?? 0) - ux * push * (1 - t), 1), inside((ys[a] ?? 0) - uy * push * (1 - t), height));
          place(b, inside((xs[b] ?? 0) - ux * push * t, 1), inside((ys[b] ?? 0) - uy * push * t, height));
        }
        let nx = inside(wx + ux * push, 1);
        let ny = inside(wy + uy * push, height);
        if (Math.hypot(nx - wx, ny - wy) < push * 0.5) {
          // The box blocks that side: cross to the other side of the edge instead.
          ux = -ux;
          uy = -uy;
          const across = need + d + 1e-6;
          nx = inside(wx + ux * across, 1);
          ny = inside(wy + uy * across, height);
        }
        place(w, nx, ny);
        moved = true;
      }
    }
    return moved;
  };

  const distanceToEdge = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
    const ex = bx - ax;
    const ey = by - ay;
    const length2 = ex * ex + ey * ey;
    const t = length2 < 1e-18 ? 0 : Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / length2));
    return Math.hypot(px - ax - t * ex, py - ay - t * ey);
  };

  /** Edge and node pairs still within clearance, edges in order and nodes in index order within each. */
  const stuckPairs = (): [number, number][] => {
    const pairs: [number, number][] = [];
    for (let e = 0; e < list.length; e++) {
      const [a, b] = list[e] ?? [0, 0];
      const ax = xs[a] ?? 0;
      const ay = ys[a] ?? 0;
      const bx = xs[b] ?? 0;
      const by = ys[b] ?? 0;
      const need = needFor(e, Math.hypot(bx - ax, by - ay));
      for (const w of nodesIn(Math.min(ax, bx) - need, Math.min(ay, by) - need, Math.max(ax, bx) + need, Math.max(ay, by) + need)) {
        if (w !== a && w !== b && distanceToEdge(xs[w] ?? 0, ys[w] ?? 0, ax, ay, bx, by) < need) pairs.push([e, w]);
      }
    }
    return pairs;
  };
  const stillStuck = (e: number, w: number): boolean => {
    const [a, b] = list[e] ?? [0, 0];
    const ax = xs[a] ?? 0;
    const ay = ys[a] ?? 0;
    const bx = xs[b] ?? 0;
    const by = ys[b] ?? 0;
    return distanceToEdge(xs[w] ?? 0, ys[w] ?? 0, ax, ay, bx, by) < needFor(e, Math.hypot(bx - ax, by - ay));
  };

  const incident = Array.from({ length: n }, () => [] as number[]);
  list.forEach(([a, b], e) => {
    incident[a]?.push(e);
    incident[b]?.push(e);
  });

  // The edge grid, for relocation only: each edge listed in every cell its clearance band covers, so the
  // edges near a spot are the ones in its cell. Rebuilt at each relocation pass, since the rounds move edge
  // ends; a relocated node re-files its own edges.
  const edgeCells: number[][] = Array.from({ length: cols * rows }, () => []);
  const filedIn: number[][] = list.map(() => []);
  const file = (e: number): void => {
    const [a, b] = list[e] ?? [0, 0];
    const ax = xs[a] ?? 0;
    const ay = ys[a] ?? 0;
    const bx = xs[b] ?? 0;
    const by = ys[b] ?? 0;
    const need = needFor(e, Math.hypot(bx - ax, by - ay));
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - need) / GRID_CELL));
    const c1 = Math.min(cols - 1, Math.floor((Math.max(ax, bx) + need) / GRID_CELL));
    const r0 = Math.max(0, Math.floor((Math.min(ay, by) - need) / GRID_CELL));
    const r1 = Math.min(rows - 1, Math.floor((Math.max(ay, by) + need) / GRID_CELL));
    const cellsOfEdge: number[] = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        edgeCells[r * cols + c]?.push(e);
        cellsOfEdge.push(r * cols + c);
      }
    }
    filedIn[e] = cellsOfEdge;
  };
  const unfile = (e: number): void => {
    for (const c of filedIn[e] ?? []) {
      const cell = edgeCells[c] ?? [];
      cell.splice(cell.indexOf(e), 1);
    }
    filedIn[e] = [];
  };
  const fileAllEdges = (): void => {
    for (const cell of edgeCells) cell.length = 0;
    for (let e = 0; e < list.length; e++) file(e);
  };

  /** Whether w can sit at (px, py): inside the box, apart from every node, off every edge, and its own edges off every node. Cheapest checks first. */
  const freeAt = (w: number, px: number, py: number): boolean => {
    if (px < PAD || px > 1 - PAD || py < PAD || py > height - PAD) return false;
    if (anyNodeIn(px - apart, py - apart, px + apart, py + apart, (v) => v !== w && Math.hypot((xs[v] ?? 0) - px, (ys[v] ?? 0) - py) < apart)) return false;
    for (const e of edgeCells[cellAt(px, py)] ?? []) {
      const [a, b] = list[e] ?? [0, 0];
      if (a === w || b === w) continue;
      const ax = xs[a] ?? 0;
      const ay = ys[a] ?? 0;
      const bx = xs[b] ?? 0;
      const by = ys[b] ?? 0;
      if (distanceToEdge(px, py, ax, ay, bx, by) < needFor(e, Math.hypot(bx - ax, by - ay))) return false;
    }
    for (const e of incident[w] ?? []) {
      const [a, b] = list[e] ?? [0, 0];
      const other = a === w ? b : a;
      const ox = xs[other] ?? 0;
      const oy = ys[other] ?? 0;
      const need = needFor(e, Math.hypot(ox - px, oy - py));
      const near = (v: number): boolean => v !== w && v !== other && distanceToEdge(xs[v] ?? 0, ys[v] ?? 0, px, py, ox, oy) < need;
      if (anyNodeIn(Math.min(px, ox) - need, Math.min(py, oy) - need, Math.max(px, ox) + need, Math.max(py, oy) + need, near)) return false;
    }
    return true;
  };

  /**
   * Moves a stuck node to the nearest free spot, tried on rings around the
   * middle of its neighbours and around where it is, nearest first. Leaves it
   * where it is, and says so, if no ring has one.
   */
  const relocate = (w: number): boolean => {
    const wx = xs[w] ?? 0;
    const wy = ys[w] ?? 0;
    const around = incident[w] ?? [];
    let cx = wx;
    let cy = wy;
    if (around.length > 0) {
      cx = 0;
      cy = 0;
      for (const e of around) {
        const [a, b] = list[e] ?? [0, 0];
        const other = a === w ? b : a;
        cx += (xs[other] ?? 0) / around.length;
        cy += (ys[other] ?? 0) / around.length;
      }
    }
    const spots: { x: number; y: number; d: number }[] = [];
    for (const [ox, oy] of [[cx, cy], [wx, wy]] as const) {
      for (let k = 1; k <= RELOCATE_RINGS; k++) {
        const radius = k * apart * 0.75;
        for (let i = 0; i < RELOCATE_ANGLES; i++) {
          const angle = (2 * Math.PI * (i + (k % 2) * 0.5)) / RELOCATE_ANGLES;
          const x = ox + radius * Math.cos(angle);
          const y = oy + radius * Math.sin(angle);
          spots.push({ x, y, d: Math.hypot(x - wx, y - wy) });
        }
      }
    }
    spots.sort((p, q) => p.d - q.d);
    for (const spot of spots) {
      if (freeAt(w, spot.x, spot.y)) {
        place(w, spot.x, spot.y);
        for (const e of incident[w] ?? []) {
          unfile(e);
          file(e);
        }
        return true;
      }
    }
    return false;
  };

  /** One pass over the stuck pairs: move the node off the edge, or failing that, move one end of the edge. */
  const relocateStuck = (): boolean => {
    const pairs = stuckPairs();
    if (pairs.length > 0) fileAllEdges();
    // A node with no free spot in this pass is not tried again in it: one long edge can be stuck on many nodes.
    const nowhere = new Set<number>();
    const tryMove = (v: number): boolean => {
      if (nowhere.has(v)) return false;
      if (relocate(v)) return true;
      nowhere.add(v);
      return false;
    };
    for (const [e, w] of pairs) {
      if (!stillStuck(e, w)) continue;
      const [a, b] = list[e] ?? [0, 0];
      if (!tryMove(w) && !tryMove(a)) tryMove(b);
    }
    return pairs.length > 0;
  };

  for (let r = 0; r < REPAIR_ROUNDS + SHARED_ROUNDS; r++) {
    if (!round(r >= REPAIR_ROUNDS)) break;
  }
  // Relocate, then let a short clean-up settle what moved. A relocation only lands where the node is clear
  // of every edge and its own edges are clear of every node, so it never undoes another; the clean-up moves
  // edge ends and can, which is why the last pass relocates without one.
  for (let attempt = 0; attempt < RELOCATE_ATTEMPTS; attempt++) {
    if (!relocateStuck()) break;
    for (let r = 0; r < CLEANUP_ROUNDS; r++) {
      if (!round(true)) break;
    }
  }
  relocateStuck();
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
