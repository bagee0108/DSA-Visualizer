import { describe, expect, it } from 'vitest';

import type { ParamMap } from '../../core/define';
import { formatMap, parseMap, type GridMap, type Square } from '../../core/gridMap';
import { parseMatrixRef } from '../../core/matrixScene';
import { makeRng } from '../../core/random';
import type { Frame } from '../../core/types';
import { expectDeterministic, expectFrameHygiene, expectInputContract, gridOf, lastFrame, runFrames } from '../frameHygiene';
import { ASTAR_PRESETS, astar, fmt, heuristicOf, OVERESTIMATE_MAP, type Heuristic } from './astar';

const SIZES = [6, 12, 20] as const;
const ADMISSIBLE: readonly (readonly [Heuristic, boolean])[] = [
  ['zero', false],
  ['zero', true],
  ['euclidean', false],
  ['euclidean', true],
  ['octile', false],
  ['octile', true],
  ['manhattan', false],
];

function mapOf(params: ParamMap): GridMap {
  const parsed = parseMap(params.map ?? '');
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

function presetMap(id: string, size: number, seed: number): string {
  const preset = ASTAR_PRESETS.find((candidate) => candidate.id === id);
  if (preset === undefined) throw new Error(`no preset ${id}`);
  return preset.build(size, makeRng(seed)).map ?? '';
}

/** Written separately from the level: legal moves are inside, not walls, and a diagonal needs both squares beside it open. */
function legal(map: GridMap, from: Square, to: Square, diagonal: boolean): number | null {
  const open = (r: number, c: number): boolean => r >= 0 && c >= 0 && r < map.rows && c < map.cols && !map.walls[r * map.cols + c];
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  if (!open(to.row, to.col) || Math.max(Math.abs(dr), Math.abs(dc)) !== 1) return null;
  if (dr !== 0 && dc !== 0) {
    if (!diagonal || !open(from.row + dr, from.col) || !open(from.row, from.col + dc)) return null;
    return Math.SQRT2;
  }
  return 1;
}

/** Dijkstra over the squares, by brute force: the shortest cost from S to G, or Infinity. */
function referenceCost(map: GridMap, diagonal: boolean): number {
  const n = map.rows * map.cols;
  const dist = new Array<number>(n).fill(Number.POSITIVE_INFINITY);
  const done = new Array<boolean>(n).fill(false);
  dist[map.start.row * map.cols + map.start.col] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u === -1 || (dist[i] ?? 0) < (dist[u] ?? 0))) u = i;
    if (u === -1 || dist[u] === Number.POSITIVE_INFINITY) break;
    done[u] = true;
    const from = { row: Math.floor(u / map.cols), col: u % map.cols };
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const to = { row: from.row + dr, col: from.col + dc };
        const cost = legal(map, from, to, diagonal);
        if (cost === null) continue;
        const v = to.row * map.cols + to.col;
        dist[v] = Math.min(dist[v] ?? 0, (dist[u] ?? 0) + cost);
      }
    }
  }
  return dist[map.goal.row * map.cols + map.goal.col] ?? Number.POSITIVE_INFINITY;
}

/** The path drawn in the final frame, S first, or null when none is drawn. */
function pathOf(final: Frame): Square[] | null {
  const lines = gridOf(final).lines;
  const first = lines[0];
  if (first === undefined) return null;
  return [first.from, ...lines.map((line) => line.to)];
}

function costOf(map: GridMap, path: readonly Square[], diagonal: boolean): number {
  let cost = 0;
  for (let i = 1; i < path.length; i++) {
    const step = legal(map, path[i - 1] as Square, path[i] as Square, diagonal);
    if (step === null) throw new Error(`illegal move ${JSON.stringify(path[i - 1])} to ${JSON.stringify(path[i])}`);
    cost += step;
  }
  return cost;
}

function expanded(final: Frame): number {
  return final.counters.extra['squares expanded'] ?? 0;
}

describe('astar: the path', () => {
  it('finds a shortest path with every admissible heuristic, on every preset at every size', () => {
    for (const preset of ASTAR_PRESETS) {
      for (const size of SIZES) {
        for (const seed of preset.id === 'maze' ? [1, 2, 3, 4, 5] : [1]) {
          const map = presetMap(preset.id, size, seed * 31 + size);
          const parsed = parseMap(map);
          if (!parsed.ok) throw new Error(parsed.error);
          for (const [heuristic, diagonal] of ADMISSIBLE) {
            const where = `${preset.id}@${size}#${seed} ${heuristic} ${diagonal ? '8' : '4'}`;
            const want = referenceCost(parsed.value, diagonal);
            const final = lastFrame(runFrames(astar, { map, heuristic, diagonal: diagonal ? '1' : '0' }));
            const path = pathOf(final);
            if (want === Number.POSITIVE_INFINITY) {
              expect(path, where).toBeNull();
              expect(final.explanation, where).toContain('there is no path to G');
              continue;
            }
            expect(path, where).not.toBeNull();
            const route = path ?? [];
            expect(route[0], where).toEqual(parsed.value.start);
            expect(route[route.length - 1], where).toEqual(parsed.value.goal);
            expect(costOf(parsed.value, route, diagonal), where).toBeCloseTo(want, 9);
            expect(final.explanation, where).toContain('it is a shortest one');
          }
        }
      }
    }
  }, 120000);

  it('with Manhattan and diagonals, still finds a legal path, never cheaper than the shortest, and says it may not be shortest', () => {
    for (const preset of ASTAR_PRESETS) {
      for (const size of SIZES) {
        const map = presetMap(preset.id, size, size);
        const parsed = mapOf({ map });
        const want = referenceCost(parsed, true);
        const final = lastFrame(runFrames(astar, { map, heuristic: 'manhattan', diagonal: '1' }));
        expect(runFrames(astar, { map, heuristic: 'manhattan', diagonal: '1' })[0]?.explanation).toContain('may not be the shortest');
        if (want === Number.POSITIVE_INFINITY) continue;
        const cost = costOf(parsed, pathOf(final) ?? [], true);
        expect(cost).toBeGreaterThanOrEqual(want - 1e-9);
        expect(final.explanation).toContain('not guaranteed to be the shortest');
      }
    }
  });

  it('really misses the shortest path with Manhattan and diagonals on its preset, 7.4 against 6.2, as the run warns', () => {
    const preset = ASTAR_PRESETS.find((candidate) => candidate.id === 'overestimate');
    expect(preset?.label).toBe('When the heuristic overestimates');
    const params = preset?.build(12, makeRng(1)) ?? {};
    expect(params).toEqual({ map: OVERESTIMATE_MAP, heuristic: 'manhattan', diagonal: '1' });
    const parsed = mapOf(params);
    const want = referenceCost(parsed, true);
    expect(fmt(want)).toBe('6.2');
    const final = lastFrame(runFrames(astar, params));
    expect(fmt(costOf(parsed, pathOf(final) ?? [], true))).toBe('7.4');
    expect(final.explanation).toContain('costs 7.4');
    expect(final.explanation).toContain('not guaranteed to be the shortest');
    for (const heuristic of ['octile', 'euclidean'] as const) {
      const fixed = lastFrame(runFrames(astar, { ...params, heuristic }));
      expect(costOf(parsed, pathOf(fixed) ?? [], true), heuristic).toBeCloseTo(want, 9);
    }
  });

  it('estimates with octile between Euclidean and the true open-ground cost, so it is tighter and still admissible', () => {
    const octile = heuristicOf('octile');
    const euclidean = heuristicOf('euclidean');
    const manhattan = heuristicOf('manhattan');
    const map = mapOf(astar.defaults);
    const open = { ...map, walls: map.walls.map(() => false) };
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.cols; col++) {
        const at = { row, col };
        expect(octile(at, map.goal)).toBeGreaterThanOrEqual(euclidean(at, map.goal) - 1e-9);
        expect(octile(at, map.goal)).toBeLessThanOrEqual(manhattan(at, map.goal) + 1e-9);
        // On open ground it is exact with diagonals: the cost of the shortest way there.
        expect(octile(at, map.goal)).toBeCloseTo(referenceCost({ ...open, start: at }, true), 9);
      }
    }
    for (const size of SIZES) {
      const map = presetMap('open', size, 1);
      const tight = expanded(lastFrame(runFrames(astar, { map, heuristic: 'octile', diagonal: '1' })));
      const loose = expanded(lastFrame(runFrames(astar, { map, heuristic: 'euclidean', diagonal: '1' })));
      expect(tight, `open@${size}`).toBeLessThanOrEqual(loose);
    }
  });

  it('knows a sealed goal is unreachable only once the open set is empty', () => {
    const final = lastFrame(runFrames(astar, { map: presetMap('sealed', 12, 1) }));
    expect(final.explanation).toContain('The open set is empty');
    expect(gridOf(final).strips[0]?.items).toHaveLength(0);
    expect(pathOf(final)).toBeNull();
  });

  it('expands fewer squares with Manhattan than with zero on the open field, which is what the heuristic is for', () => {
    for (const size of SIZES) {
      const map = presetMap('open', size, 1);
      const guided = expanded(lastFrame(runFrames(astar, { map, heuristic: 'manhattan' })));
      const blind = expanded(lastFrame(runFrames(astar, { map, heuristic: 'zero' })));
      expect(guided, `open@${size}`).toBeLessThan(blind);
    }
  });
});

describe('astar: each step', () => {
  it('writes f = g + h on every square it reaches, with h the chosen estimate', () => {
    for (const [heuristic, diagonal] of [...ADMISSIBLE, ['manhattan', true] as const]) {
      const map = mapOf(astar.defaults);
      const h = heuristicOf(heuristic);
      for (const frame of runFrames(astar, { heuristic, diagonal: diagonal ? '1' : '0' })) {
        gridOf(frame).notes?.forEach((note, at) => {
          if (note === null) return;
          const [f, g, hv] = note.split('\n').map((line) => Number(line.slice(2)));
          const square = { row: Math.floor(at / map.cols), col: at % map.cols };
          expect(Math.abs((f ?? 0) - ((g ?? 0) + (hv ?? 0)))).toBeLessThanOrEqual(0.1 + 1e-9);
          expect(hv).toBeCloseTo(Math.round(h(square, map.goal) * 10) / 10, 9);
        });
      }
    }
  });

  it('closes each square at most once, and pops the lowest f in the open set', () => {
    for (const preset of ASTAR_PRESETS) {
      const frames = runFrames(astar, { map: presetMap(preset.id, 12, 3), heuristic: 'euclidean', diagonal: '1' });
      const closedAt = new Map<string, number>();
      for (const frame of frames) {
        const active = frame.highlights.active ?? [];
        if (!frame.explanation.includes('Close it')) continue;
        const ref = String(active[0]);
        expect(closedAt.has(ref), `${preset.id}: ${ref} closed twice`).toBe(false);
        closedAt.set(ref, 1);
        expect(parseMatrixRef(ref)?.kind).toBe('cell');
      }
      for (const frame of frames) {
        const keys = (gridOf(frame).strips[0]?.items ?? []).map((item) => Number(item.label.split(':')[1]));
        keys.forEach((key, i) => {
          if (i > 0) expect(key + 0.05 + 1e-9).toBeGreaterThanOrEqual(keys[Math.floor((i - 1) / 2)] ?? 0);
        });
      }
    }
  });

  it('refuses a heuristic it does not know, and a bad map, saying why', () => {
    const bad = astar.build({ heuristic: 'chebyshev' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('Pick a heuristic');
    const noGoal = astar.build({ map: 'S../...' });
    expect(noGoal.ok).toBe(false);
  });

  it('keeps its default map in the canonical one-line form', () => {
    const map = astar.defaults.map ?? '';
    expect(formatMap(mapOf({ map }))).toBe(map);
  });
});

describe('astar: frames', () => {
  it('holds every structural invariant on every preset, both ways of moving', () => {
    expectFrameHygiene(astar, runFrames(astar, {}));
    for (const preset of ASTAR_PRESETS) {
      for (const diagonal of ['0', '1']) expectFrameHygiene(astar, runFrames(astar, { map: presetMap(preset.id, 12, 4), heuristic: 'euclidean', diagonal }));
    }
  });

  it('keeps frame counts within one per neighbour looked at, plus the pops', () => {
    // 9 x 20, no walls, zero heuristic and diagonals: everything is expanded.
    const worst = runFrames(astar, { map: presetMap('open', 20, 1), heuristic: 'zero', diagonal: '1' });
    const squares = 9 * 20;
    expect(worst.length).toBeLessThanOrEqual(squares * 8 + squares * 9 + 2);
  });

  it('is deterministic', () => {
    expectDeterministic(astar, {});
    expectDeterministic(astar, { map: presetMap('maze', 20, 9), heuristic: 'euclidean', diagonal: '1' });
  });

  it('honours its input contract', () => {
    expectInputContract(astar);
  });
});
