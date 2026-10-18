import { describe, expect, it } from 'vitest';

import { MAX_GRAPH_NODES } from '../../core/graphInput';
import { makeRng } from '../../core/random';
import type { Frame } from '../../core/types';
import { componentOutlines, graphBandBottom, graphGeometry } from '../../renderers/GraphRenderer';
import { expectDeterministic, expectFrameHygiene, expectInputContract, graphOf, lastFrame, runFrames } from '../frameHygiene';
import { adjacencyOf, finalLabels, stripIds, type Adjacency } from './graphTestkit';
import { TARJAN_PRESETS, tarjanScc, UNDIRECTED_ERROR, UNDISCOVERED } from './tarjan';

const SAMPLE = '0-10,1-4,2-6,3-8,4-1,5-0,5-3,6-4,6-9,7-3,8-7,9-2,9-7,10-2,10-5';

function run(g: string, extra: Record<string, string> = {}): Frame[] {
  return [...runFrames(tarjanScc, { g, directed: '1', ...extra })];
}

/** Components by mutual reachability, independent of any DFS: one BFS per node. */
function referenceComponents(adj: Adjacency): number[][] {
  const reach = Array.from({ length: adj.nodeCount }, (_, s) => {
    const seen = new Set([s]);
    const queue = [s];
    for (let head = 0; head < queue.length; head++) {
      for (const { to } of adj.out[queue[head] ?? 0] ?? []) {
        if (!seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
    return seen;
  });
  const placed = new Set<number>();
  const out: number[][] = [];
  for (let u = 0; u < adj.nodeCount; u++) {
    if (placed.has(u)) continue;
    const group = [];
    for (let v = 0; v < adj.nodeCount; v++) if (reach[u]?.has(v) === true && reach[v]?.has(u) === true) group.push(v);
    for (const v of group) placed.add(v);
    out.push(group);
  }
  return out;
}

function canonical(groups: readonly (readonly (number | string)[])[]): string[] {
  return groups.map((group) => group.map(Number).sort((a, b) => a - b).join(' ')).sort();
}

function componentsOf(frame: Frame): number[][] {
  return graphOf(frame).components.map((component) => component.nodes.map(Number));
}

function expectReverseTopological(frame: Frame, adj: Adjacency): void {
  const order = new Map<number, number>();
  componentsOf(frame).forEach((group, i) => {
    for (const id of group) order.set(id, i);
  });
  for (const edge of adj.edges) {
    const a = order.get(edge.from) ?? -1;
    const b = order.get(edge.to) ?? -1;
    // An edge leaving a component points at one that closed earlier.
    expect(b, `${edge.from}->${edge.to}`).toBeLessThanOrEqual(a);
  }
}

describe('tarjan: components', () => {
  it('finds the four components of the sample, in reverse topological order', () => {
    const frames = run(SAMPLE);
    const final = lastFrame(frames);
    expect(canonical(componentsOf(final))).toEqual(canonical([[0, 5, 10], [2, 6, 9], [1, 4], [3, 7, 8]]));
    expectReverseTopological(final, adjacencyOf(SAMPLE, true));
    expect(stripIds(final, 'components')).toEqual(['C1', 'C2', 'C3', 'C4']);
  });

  it('matches mutual reachability on every preset up to the node cap', () => {
    for (const preset of TARJAN_PRESETS) {
      for (const size of [4, 6, 40, MAX_GRAPH_NODES]) {
        const params = preset.build(size, makeRng(size * 7));
        const g = params.g ?? '';
        const final = lastFrame(runFrames(tarjanScc, params));
        const adj = adjacencyOf(g, true);
        expect(canonical(componentsOf(final)), `${preset.id} @ ${size}`).toEqual(canonical(referenceComponents(adj)));
        expectReverseTopological(final, adj);
      }
    }
  });

  it('gives each preset its promised shape', () => {
    const shape = (id: string, size: number): number[] => {
      const preset = TARJAN_PRESETS.find((candidate) => candidate.id === id);
      return componentsOf(lastFrame(runFrames(tarjanScc, preset?.build(size, makeRng(3)) ?? {}))).map((group) => group.length);
    };
    expect(shape('ring', 30)).toEqual([30]);
    expect(shape('dag', 30)).toEqual(Array.from({ length: 30 }, () => 1));
    expect(Math.max(...shape('clusters', 30))).toBeGreaterThan(1);
    expect(Math.max(...shape('random', 30))).toBeGreaterThan(1);
  });
});

describe('tarjan: index and low-link', () => {
  it('labels every node with a dash until it is discovered', () => {
    const frames = run(SAMPLE);
    const first = graphOf(frames[0]);
    expect(Object.values(first.labels)).toEqual(Array.from({ length: 11 }, () => UNDISCOVERED));
    for (const frame of frames) {
      const { labels, visited } = graphOf(frame);
      const seen = new Set(visited);
      for (const [id, label] of Object.entries(labels)) expect(label === UNDISCOVERED, `node ${id}`).toBe(!seen.has(id));
    }
  });

  it('ends with low <= index, and low = index exactly at each component root', () => {
    const frames = run(SAMPLE);
    const labels = finalLabels(frames);
    const roots = new Set<string>();
    for (const component of graphOf(lastFrame(frames)).components) {
      // The root closes the component, so it is the last node popped.
      roots.add(component.nodes[component.nodes.length - 1] ?? '');
    }
    const indices = new Set<number>();
    for (const [id, label] of Object.entries(labels)) {
      const [index, low] = label.split('/').map(Number);
      expect(low ?? -1).toBeLessThanOrEqual(index ?? -1);
      expect(low === index, `node ${id}`).toBe(roots.has(id));
      indices.add(index ?? -1);
    }
    expect([...indices].sort((a, b) => a - b)).toEqual(Array.from({ length: 11 }, (_, i) => i));
  });

  it('gives every member the root as its lowest reachable index', () => {
    const frames = run(SAMPLE);
    const labels = finalLabels(frames);
    for (const component of graphOf(lastFrame(frames)).components) {
      const root = component.nodes[component.nodes.length - 1] ?? '';
      const rootIndex = Number(labels[root]?.split('/')[0]);
      for (const id of component.nodes) expect(Number(labels[id]?.split('/')[1]), `node ${id}`).toBeGreaterThanOrEqual(rootIndex);
    }
  });
});

describe('tarjan: frames', () => {
  it('spends 4V + E + 1 frames', () => {
    const adj = adjacencyOf(SAMPLE, true);
    expect(run(SAMPLE)).toHaveLength(4 * adj.nodeCount + adj.edges.length + 1);
    const ring = TARJAN_PRESETS.find((preset) => preset.id === 'ring')?.build(MAX_GRAPH_NODES, makeRng(1)) ?? {};
    const big = adjacencyOf(ring.g ?? '', true);
    expect(runFrames(tarjanScc, ring)).toHaveLength(4 * big.nodeCount + big.edges.length + 1);
  });

  it('only ever grows the component list, and keeps the stack strip disjoint from it', () => {
    let previous: readonly unknown[] = [];
    for (const frame of run(SAMPLE)) {
      const { components } = graphOf(frame);
      expect(components.slice(0, previous.length)).toEqual(previous);
      previous = components;
      const grouped = new Set(components.flatMap((component) => component.nodes));
      for (const id of stripIds(frame, 'stack')) expect(grouped.has(id)).toBe(false);
    }
  });

  it('holds every structural invariant, with the recursion bound raised to the node cap', () => {
    expectFrameHygiene(tarjanScc, run(SAMPLE), { maxStackDepth: MAX_GRAPH_NODES + 2 });
    // Every preset at a moderate size, and one at the cap, keeps this inside the default timeout.
    for (const preset of TARJAN_PRESETS) {
      expectFrameHygiene(tarjanScc, runFrames(tarjanScc, preset.build(40, makeRng(4))), { maxStackDepth: MAX_GRAPH_NODES + 2 });
    }
    const clusters = TARJAN_PRESETS.find((preset) => preset.id === 'clusters');
    expectFrameHygiene(tarjanScc, runFrames(tarjanScc, clusters?.build(MAX_GRAPH_NODES, makeRng(4)) ?? {}), { maxStackDepth: MAX_GRAPH_NODES + 2 });
  });

  it('is deterministic', () => {
    expectDeterministic(tarjanScc, { g: SAMPLE, directed: '1' });
  });

  it('honours its input contract and refuses an undirected graph', () => {
    expectInputContract(tarjanScc);
    const refused = tarjanScc.build({ g: SAMPLE, directed: '0' });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe(UNDIRECTED_ERROR);
  });
});

describe('tarjan: outlines on the canvas', () => {
  /** Point in polygon by ray casting, independent of the renderer's convex test. */
  function inside(p: { x: number; y: number }, polygon: readonly { x: number; y: number }[]): boolean {
    let hit = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i] ?? p;
      const b = polygon[j] ?? p;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  }

  it('never draws an outline around another component\'s node, on any preset at any size', () => {
    for (const preset of TARJAN_PRESETS) {
      for (const size of [6, 12, 40, MAX_GRAPH_NODES]) {
        for (const seed of [1, 2, 3]) {
          const final = graphOf(lastFrame(runFrames(tarjanScc, preset.build(size, makeRng(size * 31 + seed)))));
          const geometry = graphGeometry(final.graph, graphBandBottom(final.strips.length));
          const outlines = componentOutlines(geometry, final.components);
          expect(outlines.map((outline) => outline.id)).toEqual(final.components.map((component) => component.id));
          for (const [i, outline] of outlines.entries()) {
            if (outline.mode !== 'outline') continue;
            const own = new Set(final.components[i]?.nodes);
            for (const [id, at] of geometry.positions) {
              if (own.has(id)) expect(inside(at, outline.points), `${preset.id} @ ${size}: ${outline.id} misses ${id}`).toBe(true);
              else expect(inside(at, outline.points), `${preset.id} @ ${size}: ${outline.id} holds ${id}`).toBe(false);
            }
          }
        }
      }
    }
  });
});
