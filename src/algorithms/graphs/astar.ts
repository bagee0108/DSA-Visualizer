/** A* on a grid: the open set as a binary heap keyed on f = g + h, with f, g and h written on every square it reaches. */

import { defineAlgorithm, type ParamMap, type ParseResult, type PresetSpec } from '../../core/define';
import { formatMap, MAX_MAP_COLS, mapSizeOf, parseMap, type GridMap, type Square } from '../../core/gridMap';
import { GridScene } from '../../core/gridScene';
import { cellRef } from '../../core/matrixScene';
import { randomInt } from '../../core/random';
import type { EntityId, GridLine, Strip } from '../../core/types';
import { stepIds } from '../../core/steps';
import { MinHeap } from './minHeap';

export type Heuristic = 'manhattan' | 'euclidean' | 'octile' | 'zero';

export interface AStarInput {
  readonly map: GridMap;
  readonly heuristic: Heuristic;
  readonly diagonal: boolean;
}

const CODE = `function aStar(start: Square, goal: Square): Square[] | null {
  g[start] = 0;
  open.push([h(start), start]);                  // f = g + h; at the start g is 0
  while (open.size > 0) {
    const [f, u] = open.popMin();                // the lowest f: cheapest-looking way to the goal
    if (closed.has(u)) continue;                 // stale: u was reached more cheaply already
    if (u === goal) return pathTo(goal);         // popped, so no open square can beat it
    closed.add(u);
    for (const [v, step] of moves(u)) {          // 4 or 8 neighbours; no walls, no cutting a corner
      const tentative = g[u] + step;             // a step costs 1, a diagonal √2
      if (closed.has(v) || tentative >= g[v]) continue;
      g[v] = tentative;
      prev[v] = u;
      open.push([g[v] + h(v), v]);               // lazy: an older entry for v goes stale
    }
  }
  return null;                                   // open set empty: the goal cannot be reached
}`;

const CODE_LINES = CODE.split('\n');
function lineOf(text: string): number {
  const at = CODE_LINES.findIndex((line) => line.includes(text));
  if (at < 0) throw new Error(`no code line contains ${text}`);
  return at + 1;
}

const LINE = {
  push0: lineOf('open.push([h(start)'),
  pop: lineOf('open.popMin()'),
  stale: lineOf('stale: u was reached'),
  goal: lineOf('return pathTo(goal)'),
  close: lineOf('closed.add(u)'),
  test: lineOf('tentative >= g[v]'),
  push: lineOf('open.push([g[v] + h(v), v])'),
  none: lineOf('return null'),
} as const;
const STEP = stepIds(LINE);

/** Float noise in sums of √2 must not count as an improvement. */
const EPS = 1e-9;

export const HEURISTIC_LABEL: Readonly<Record<Heuristic, string>> = {
  manhattan: 'Manhattan',
  euclidean: 'Euclidean',
  octile: 'octile',
  zero: 'zero',
};

export function heuristicOf(kind: Heuristic): (a: Square, b: Square) => number {
  switch (kind) {
    case 'manhattan':
      return (a, b) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
    case 'euclidean':
      return (a, b) => Math.hypot(a.row - b.row, a.col - b.col);
    case 'octile':
      // The cost of the open-ground way: a diagonal for each step both ways close, then straight.
      return (a, b) => {
        const dr = Math.abs(a.row - b.row);
        const dc = Math.abs(a.col - b.col);
        return Math.max(dr, dc) + (Math.SQRT2 - 1) * Math.min(dr, dc);
      };
    case 'zero':
      return () => 0;
  }
}

/** North, east, south, west, then the diagonals clockwise from north-east. */
const STEPS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 1],
  [1, 1],
  [1, -1],
  [-1, -1],
];

/**
 * The squares one move from `at`, with the move's cost: inside the map, not a
 * wall, and for a diagonal, not squeezing past the corner of a wall (both
 * squares it passes between must be open).
 */
export function movesFrom(map: GridMap, at: Square, diagonal: boolean): { readonly to: Square; readonly cost: number }[] {
  const open = (row: number, col: number): boolean => row >= 0 && col >= 0 && row < map.rows && col < map.cols && map.walls[row * map.cols + col] !== true;
  const out: { to: Square; cost: number }[] = [];
  for (const [dr, dc] of STEPS.slice(0, diagonal ? 8 : 4)) {
    const row = at.row + dr;
    const col = at.col + dc;
    if (!open(row, col)) continue;
    if (dr !== 0 && dc !== 0 && (!open(at.row + dr, at.col) || !open(at.row, at.col + dc))) continue;
    out.push({ to: { row, col }, cost: dr !== 0 && dc !== 0 ? Math.SQRT2 : 1 });
  }
  return out;
}

/** As written on a square and in the strip: a whole number as is, anything else to one decimal. */
export function fmt(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const HEURISTICS: readonly Heuristic[] = ['manhattan', 'euclidean', 'octile', 'zero'];

function parse(params: ParamMap): ParseResult<AStarInput> {
  const map = parseMap(params.map ?? '');
  if (!map.ok) return map;
  const heuristic = HEURISTICS.find((kind) => kind === params.heuristic);
  if (heuristic === undefined) return { ok: false, error: 'Pick a heuristic: Manhattan, Euclidean, octile or zero.' };
  return { ok: true, value: { map: map.value, heuristic, diagonal: params.diagonal === '1' } };
}

/* ---------------- presets: size is the number of columns ---------------- */

const MIN_COLS = 6;

function shape(size: number): { rows: number; cols: number } {
  const cols = Math.max(MIN_COLS, Math.min(MAX_MAP_COLS, size));
  return { cols, rows: Math.max(4, Math.min(9, Math.round(cols * 0.45))) };
}

/** A map from a wall test, with S and G on the middle row near either end. */
function draw(rows: number, cols: number, wall: (row: number, col: number) => boolean, start?: Square, goal?: Square): ParamMap {
  const s = start ?? { row: Math.floor(rows / 2), col: 1 };
  const g = goal ?? { row: Math.floor(rows / 2), col: cols - 2 };
  const walls = Array.from({ length: rows * cols }, (_, at) => {
    const row = Math.floor(at / cols);
    const col = at % cols;
    return !(row === s.row && col === s.col) && !(row === g.row && col === g.col) && wall(row, col);
  });
  return { map: formatMap({ rows, cols, walls, start: s, goal: g }) };
}

/** Whether G can be reached from S, four ways, so a random maze is kept only when it has a way through. */
function connected(map: GridMap): boolean {
  const seen = new Set<number>([map.start.row * map.cols + map.start.col]);
  const queue: Square[] = [map.start];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as Square;
    if (at.row === map.goal.row && at.col === map.goal.col) return true;
    for (const { to } of movesFrom(map, at, false)) {
      const key = to.row * map.cols + to.col;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(to);
    }
  }
  return false;
}

/** Manhattan with diagonals finds a path of 7.4 here; the shortest is 6.2. */
export const OVERESTIMATE_MAP = '.....S/#...#./....../G...../##..##';

export const ASTAR_PRESETS: readonly PresetSpec[] = [
  {
    id: 'open',
    label: 'Open field',
    build: (size) => {
      const { rows, cols } = shape(size);
      return draw(rows, cols, () => false);
    },
    description: 'no walls. Try Manhattan, then zero: the heuristic is what keeps the search heading for G instead of spreading out evenly in every direction.',
  },
  {
    id: 'wall',
    label: 'Wall with a gap',
    build: (size) => {
      const { rows, cols } = shape(size);
      const mid = Math.floor(cols / 2);
      return draw(rows, cols, (row, col) => col === mid && row > 0);
    },
    description: 'a wall between S and G with one gap, at the top. The heuristic points straight at the wall, so the search presses against it before it finds the way round.',
  },
  {
    id: 'pocket',
    label: 'Pocket',
    build: (size) => {
      const { rows, cols } = shape(size);
      const mid = Math.floor(rows / 2);
      const back = Math.min(cols - 3, Math.floor(cols / 2) + 1);
      const top = Math.max(0, mid - 2);
      const bottom = Math.min(rows - 1, mid + 2);
      return draw(rows, cols, (row, col) => (col === back && row >= top && row <= bottom) || ((row === top || row === bottom) && col >= 2 && col <= back));
    },
    description: 'a cup open towards S, its back between S and G. Every square inside looks closer to G than the way round, so the search fills the cup before it climbs out.',
  },
  {
    id: 'maze',
    label: 'Random walls',
    build: (size, rng) => {
      const { rows, cols } = shape(size);
      // Keep drawing until G can be reached; the walls get sparser each try, so this ends.
      for (let attempt = 0; ; attempt++) {
        const density = Math.max(0, 30 - attempt * 3);
        const params = draw(rows, cols, () => randomInt(rng, 0, 99) < density);
        const map = parseMap(params.map ?? '');
        if (map.ok && connected(map.value)) return params;
      }
    },
    description: 'about three squares in ten are walls, drawn at random until there is a way through.',
  },
  {
    id: 'sealed',
    label: 'No way through',
    build: (size) => {
      const { rows, cols } = shape(size);
      const mid = Math.floor(rows / 2);
      const goal = { row: mid, col: cols - 2 };
      return draw(rows, cols, (row, col) => Math.max(Math.abs(row - goal.row), Math.abs(col - goal.col)) === 1, undefined, goal);
    },
    description: 'G is walled in on all eight sides. A* runs until the open set is empty, and that is how it knows there is no path.',
  },
  {
    id: 'overestimate',
    label: 'When the heuristic overestimates',
    // One fixed map, found by a random search over small maps: the size slider does not change it.
    build: () => ({ map: OVERESTIMATE_MAP, heuristic: 'manhattan', diagonal: '1' }),
    description:
      'Manhattan with diagonals, on a fixed 5 × 6 map. Manhattan counts 2 for a diagonal that costs √2, so the squares on the real shortest way, which cuts across diagonally, look dearer than they are (f = 8 along the top). The search goes down the right edge and along row 3 instead, where every step is straight and the estimate is exact, and pops G at a cost of 7.4 without ever expanding a square of the 6.2 path. Switch to octile or Euclidean to get 6.2.',
  },
];

const DEFAULT_MAP = '........../....#...../.S..#...G./....#...../....#...../..........';

export const astar = defineAlgorithm<AStarInput>({
  meta: {
    id: 'astar',
    name: 'A* pathfinding',
    category: 'graphs',
    structureKind: 'grid',
    blurb: 'Grid search showing f, g and h per cell as the frontier expands.',
    complexity: {
      time: { best: 'O(d log d)', average: 'O(V log V)', worst: 'O(V log V)' },
      space: 'O(V)',
      notes: [
        'V is the number of open squares; each has at most 8 neighbours, so E is O(V) and the heap work is O(V log V) at worst. The best case, a perfect estimate with ties broken towards the goal, expands only the d squares of the path.',
        'g is the cost of the best way found so far from S; h is the estimate from the square to G; f = g + h orders the open set. With h = 0, A* is Dijkstra on the grid.',
        'An estimate that never overestimates (admissible) makes the first path popped at G a shortest one. Euclidean, octile and zero are admissible with or without diagonals; octile, the cost of the way across open ground, is the tightest of them with diagonals. Manhattan is admissible only with four directions: with diagonals it counts 2 for a step that costs √2, so the path may not be shortest.',
        'A step costs 1 and a diagonal √2. A diagonal cannot squeeze past the corner of a wall. On equal f, the square pushed first comes out first.',
      ],
    },
    code: CODE,
    stepLines: LINE,
    trackedCounters: ['comparisons'],
  },
  fields: [
    {
      key: 'map',
      label: 'Map',
      kind: 'map',
      defaultValue: DEFAULT_MAP,
      placeholder: 'S...\n.##.\n...G',
      help: 'S start, G goal, # wall, . open; one row per line, up to 9 rows of 20.',
    },
    {
      key: 'heuristic',
      label: 'Heuristic h',
      kind: 'select',
      defaultValue: 'manhattan',
      options: [
        { value: 'manhattan', label: 'Manhattan (rows + columns)' },
        { value: 'euclidean', label: 'Euclidean (straight line)' },
        { value: 'octile', label: 'Octile (diagonals at √2)' },
        { value: 'zero', label: 'Zero (Dijkstra)' },
      ],
    },
    {
      key: 'diagonal',
      label: 'Moves',
      kind: 'select',
      defaultValue: '0',
      options: [
        { value: '0', label: '4 directions' },
        { value: '1', label: '8 directions (diagonals cost √2)' },
      ],
    },
  ],
  presets: ASTAR_PRESETS,
  sizeRange: { min: MIN_COLS, max: MAX_MAP_COLS, step: 1 },
  sizeOf: mapSizeOf,
  parse,
  *run({ map, heuristic, diagonal }) {
    const { rows, cols, start, goal } = map;
    const scene = new GridScene({
      rows,
      cols,
      rowHeaders: Array.from({ length: rows }, (_, at) => String(at)),
      colHeaders: Array.from({ length: cols }, (_, at) => String(at)),
      piece: 'text',
      walls: map.walls,
      notes: true,
    });
    scene.give(start.row, start.col, 'S');
    scene.give(goal.row, goal.col, 'G');

    const h = heuristicOf(heuristic);
    const index = (at: Square): number => at.row * cols + at.col;
    const refs: readonly string[] = Array.from({ length: rows * cols }, (_, at) => cellRef(Math.floor(at / cols), at % cols));
    const ref = (at: Square): string => refs[index(at)] ?? '';
    const name = (at: Square): string => `${at.row},${at.col}`;
    const squareOf = (at: number): Square => ({ row: Math.floor(at / cols), col: at % cols });

    const g = new Float64Array(rows * cols).fill(Number.POSITIVE_INFINITY);
    const prev = new Int32Array(rows * cols).fill(-1);
    const closed = new Uint8Array(rows * cols);
    const open = new MinHeap();
    // Highlight lists change only when a square opens or closes, so each is rebuilt then and shared until the next change.
    const closedList: string[] = [];
    let closedShot: readonly string[] = Object.freeze([]);
    let openShot: readonly string[] | null = null;
    const closedRefs = (): readonly string[] => closedShot;
    const openRefs = (): readonly string[] => {
      if (openShot === null) {
        const seen = new Set<number>();
        for (const entry of open.entries) {
          const at = Number(entry.node);
          if (closed[at] !== 1) seen.add(at);
        }
        openShot = Object.freeze([...seen].sort((a, b) => a - b).map((at) => refs[at] ?? ''));
      }
      return openShot;
    };

    const label = (at: Square): string => {
      const gv = g[index(at)] ?? 0;
      const hv = h(at, goal);
      return `f ${fmt(gv + hv)}\ng ${fmt(gv)}\nh ${fmt(hv)}`;
    };
    const strips = (): readonly Strip[] => [
      { label: 'open set', kind: 'pq', items: open.entries.map((entry) => ({ id: `q${entry.seq}`, label: `${name(squareOf(Number(entry.node)))}:${fmt(entry.key)}` })) },
    ];
    const mode = `${HEURISTIC_LABEL[heuristic]}${diagonal ? ', 8 directions' : ', 4 directions'}`;
    const inadmissible = heuristic === 'manhattan' && diagonal;

    g[index(start)] = 0;
    scene.note(start.row, start.col, label(start));
    const first = open.push(h(start, goal), String(index(start)));
    openShot = null;
    yield scene.frame({
      step: STEP.push0,
      explanation: `A* from S to G (${mode}). Each square it reaches shows f, g and h: g is the cost of the best way found from S, h the ${heuristic === 'zero' ? 'estimate to G, here always 0, so this is Dijkstra' : `${HEURISTIC_LABEL[heuristic]} estimate to G`}, and f = g + h orders the open set. S starts it at g = 0.${
        inadmissible ? ' Note: with diagonals, Manhattan counts 2 for a step that costs √2, so it can overestimate and the path found may not be the shortest.' : ''
      }`,
      highlights: { active: [ref(start)], candidate: [`pq:q${first.seq}`] },
      strips: strips(),
      phase: 'search',
    });

    let expanded = 0;
    while (open.size > 0) {
      const entry = open.pop();
      if (entry === undefined) break;
      openShot = null;
      const at = Number(entry.node);
      const u = squareOf(at);
      scene.countComparison();
      if (closed[at] === 1) {
        scene.bump('stale pops');
        yield scene.frame({
          step: STEP.stale,
          explanation: `Pop ${name(u)} at f = ${fmt(entry.key)}, but it is already closed: it was reached more cheaply after this entry was pushed. Skip it.`,
          highlights: { visited: closedRefs(), candidate: openRefs(), excluded: [ref(u)] },
          strips: strips(),
          phase: 'search',
        });
        continue;
      }

      if (u.row === goal.row && u.col === goal.col) {
        const path: Square[] = [];
        for (let step = at; step !== -1; step = prev[step] ?? -1) path.push(squareOf(step));
        path.reverse();
        const lines: GridLine[] = path.slice(1).map((to, i) => ({ from: path[i] as Square, to }));
        const length = g[at] ?? 0;
        yield scene.frame({
          step: STEP.goal,
          explanation: `Pop G at f = ${fmt(entry.key)}: the lowest f in the open set is the goal, so the search stops. The path has ${path.length - 1} moves and costs ${fmt(length)}, after ${expanded} squares were expanded.${
            inadmissible
              ? ' Manhattan can overestimate with diagonals, so this path is not guaranteed to be the shortest.'
              : ` ${HEURISTIC_LABEL[heuristic] === 'zero' ? 'h = 0' : HEURISTIC_LABEL[heuristic]} never overestimates here, so no open square could lead to a cheaper path: it is a shortest one.`
          }`,
          highlights: { visited: closedRefs(), sorted: path.map(ref) as EntityId[] },
          lines,
          strips: strips(),
          phase: 'done',
        });
        return;
      }

      closed[at] = 1;
      closedList.push(ref(u));
      closedShot = Object.freeze([...closedList]);
      expanded += 1;
      scene.bump('squares expanded');
      yield scene.frame({
        step: STEP.close,
        explanation: `Pop ${name(u)}, the lowest f in the open set: f = ${fmt(entry.key)} (g ${fmt(g[at] ?? 0)} + h ${fmt(h(u, goal))}). Close it and look at its neighbours.`,
        highlights: { visited: closedRefs(), candidate: openRefs(), active: [ref(u)] },
        strips: strips(),
        phase: 'search',
      });

      for (const { to: v, cost } of movesFrom(map, u, diagonal)) {
        const vi = index(v);
        const tentative = (g[at] ?? 0) + cost;
        const known = g[vi] ?? Number.POSITIVE_INFINITY;
        const move = cost === 1 ? '1' : '√2';
        scene.countComparison();
        if (closed[vi] === 1) {
          yield scene.frame({
            step: STEP.test,
            explanation: `${name(u)} to ${name(v)}: ${name(v)} is already closed.`,
            highlights: { visited: closedRefs(), candidate: openRefs(), active: [ref(u)], excluded: [ref(v)] },
            strips: strips(),
            phase: 'search',
          });
          continue;
        }
        if (tentative >= known - EPS) {
          yield scene.frame({
            step: STEP.test,
            explanation: `${name(u)} to ${name(v)}: g ${fmt(g[at] ?? 0)} + ${move} = ${fmt(tentative)}, no better than the ${fmt(known)} already known. Leave it.`,
            highlights: { visited: closedRefs(), candidate: openRefs(), active: [ref(u)], comparing: [ref(v)] },
            strips: strips(),
            phase: 'search',
          });
          continue;
        }
        g[vi] = tentative;
        prev[vi] = at;
        scene.note(v.row, v.col, label(v));
        const f = tentative + h(v, goal);
        const pushed = open.push(f, String(vi));
        openShot = null;
        yield scene.frame({
          step: STEP.push,
          explanation:
            known === Number.POSITIVE_INFINITY
              ? `${name(u)} to ${name(v)}: first way there, g = ${fmt(g[at] ?? 0)} + ${move} = ${fmt(tentative)}; h = ${fmt(h(v, goal))}, so f = ${fmt(f)}. Push it.`
              : `${name(u)} to ${name(v)}: g = ${fmt(tentative)} beats ${fmt(known)}, so f drops to ${fmt(f)}. Push a fresh entry; the old one will surface stale.`,
          highlights: { visited: closedRefs(), candidate: [...openRefs(), `pq:q${pushed.seq}`], active: [ref(u)], comparing: [ref(v)] },
          strips: strips(),
          phase: 'search',
        });
      }
    }

    yield scene.frame({
      step: STEP.none,
      explanation: `The open set is empty after ${expanded} squares were expanded, and G was never popped: every square reachable from S has been closed, so there is no path to G.`,
      highlights: { visited: closedRefs() },
      strips: strips(),
      phase: 'done',
    });
  },
});
