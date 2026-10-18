import { describe, expect, it } from 'vitest';

import { MAX_GRAPH_NODES } from '../../core/graphInput';
import { makeRng } from '../../core/random';
import type { Frame } from '../../core/types';
import { expectDeterministic, expectFrameHygiene, expectInputContract, graphOf, lastFrame, runFrames } from '../frameHygiene';
import { BELLMAN_FORD_PRESETS, bellmanFord, NEGATIVE_CYCLE, UNDIRECTED_ERROR } from './bellmanFord';
import { adjacencyOf, finalLabels, stripOf, type Adjacency } from './graphTestkit';

const SAMPLE = '3-4:2,2-3:-2,1-2:3,0-1:4,0-2:6,1-3:5,4-5:-1,2-5:4,0-6:1,6-5:2';
const SIZES = [4, 12, 40, MAX_GRAPH_NODES] as const;

function run(g: string, extra: Record<string, string> = {}): Frame[] {
  return [...runFrames(bellmanFord, { g, directed: '1', ...extra })];
}

function presetParams(id: string, size: number, seed: number): Record<string, string> {
  const preset = BELLMAN_FORD_PRESETS.find((candidate) => candidate.id === id);
  if (preset === undefined) throw new Error(`no preset ${id}`);
  return { ...preset.build(size, makeRng(seed)) };
}

/** Plain Bellman-Ford over the edge list in its given order; null when a negative cycle is reachable. */
function reference(adj: Adjacency, start: number): number[] | null {
  const dist = Array.from({ length: adj.nodeCount }, () => Number.POSITIVE_INFINITY);
  dist[start] = 0;
  for (let pass = 1; pass < adj.nodeCount; pass++) {
    for (const edge of adj.edges) {
      const via = (dist[edge.from] ?? Number.POSITIVE_INFINITY) + (edge.weight ?? 0);
      if (via < (dist[edge.to] ?? Number.POSITIVE_INFINITY)) dist[edge.to] = via;
    }
  }
  for (const edge of adj.edges) {
    if ((dist[edge.from] ?? Number.POSITIVE_INFINITY) + (edge.weight ?? 0) < (dist[edge.to] ?? Number.POSITIVE_INFINITY)) return null;
  }
  return dist;
}

/** Textbook Dijkstra that never revisits a settled node, to show where it goes wrong. */
function greedyDijkstra(adj: Adjacency, start: number): number[] {
  const dist = Array.from({ length: adj.nodeCount }, () => Number.POSITIVE_INFINITY);
  const done = new Set<number>();
  dist[start] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < adj.nodeCount; i++) if (!done.has(i) && (u === -1 || (dist[i] ?? 0) < (dist[u] ?? 0))) u = i;
    if (u === -1 || !Number.isFinite(dist[u] ?? Number.POSITIVE_INFINITY)) return dist;
    done.add(u);
    for (const { to, weight } of adj.out[u] ?? []) {
      if (!done.has(to) && (dist[u] ?? 0) + weight < (dist[to] ?? 0)) dist[to] = (dist[u] ?? 0) + weight;
    }
  }
}

function distances(frames: readonly Frame[]): number[] {
  const labels = finalLabels(frames);
  return Object.keys(labels)
    .map(Number)
    .sort((a, b) => a - b)
    .map((id) => (labels[String(id)] === '∞' ? Number.POSITIVE_INFINITY : Number((labels[String(id)] ?? '').replace('−', '-'))));
}

describe('bellman-ford: distances', () => {
  it('matches a reference on the sample and on every acyclic preset at every size', () => {
    expect(distances(run(SAMPLE))).toEqual(reference(adjacencyOf(SAMPLE, true), 0));
    for (const id of ['negative', 'dijkstra-fails', 'one-pass']) {
      for (const size of SIZES) {
        const params = presetParams(id, size, size * 7);
        const want = reference(adjacencyOf(params.g ?? '', true), 0);
        expect(want, `${id} @ ${size}: no negative cycle`).not.toBeNull();
        const frames = runFrames(bellmanFord, params);
        expect(lastFrame(frames).phase, `${id} @ ${size}`).toBe('done');
        expect(distances(frames), `${id} @ ${size}`).toEqual(want);
      }
    }
  });

  it('gets the Dijkstra-fails preset right where a greedy Dijkstra does not', () => {
    for (const size of [4, 12, 40]) {
      const params = presetParams('dijkstra-fails', size, size);
      const adj = adjacencyOf(params.g ?? '', true);
      const got = distances(runFrames(bellmanFord, params));
      expect(got[1]).toBe(1);
      expect(greedyDijkstra(adj, 0)[1]).toBe(2);
    }
  });

  it('stops early when a pass relaxes nothing, and says so', () => {
    for (const size of SIZES) {
      const frames = runFrames(bellmanFord, presetParams('one-pass', size, size));
      const final = lastFrame(frames);
      expect(final.counters.extra.passes, `one-pass @ ${size}`).toBe(2);
      expect(final.explanation).toContain('Pass 2 relaxed nothing');
      expect(frames.some((frame) => frame.phase === 'check')).toBe(false);
    }
  });

  it('counts passes as "pass k of V-1" and never runs more than V-1 of them', () => {
    const frames = run(SAMPLE);
    const passes = frames.map((frame) => frame.phase ?? '').filter((phase) => phase.startsWith('pass '));
    expect(passes.length).toBeGreaterThan(0);
    for (const phase of passes) expect(phase).toMatch(/^pass [1-6] of 6$/);
  });

  it('shows the rest of the pass in a fixed order with the current edge first and marked', () => {
    for (const frame of run(SAMPLE)) {
      const marked = (frame.highlights.active ?? []).filter((id) => typeof id === 'string' && id.startsWith('queue:'));
      if (marked.length === 0) continue;
      const strip = stripOf(frame, 'edge order');
      expect(marked).toEqual([`queue:${strip.items[0]?.id}`]);
      const order = graphOf(frame).graph.edges.map((edge) => edge.id);
      expect(strip.items.map((item) => item.id)).toEqual(order.slice(order.length - strip.items.length));
    }
  });
});

describe('bellman-ford: negative cycles', () => {
  it('ends in the undefined frame with a highlighted cycle that really is negative', () => {
    for (const size of SIZES) {
      for (const seed of [1, 2, 3]) {
        const params = presetParams('negative-cycle', size, size * 11 + seed);
        expect(reference(adjacencyOf(params.g ?? '', true), 0), `negative-cycle @ ${size}`).toBeNull();
        const built = bellmanFord.build(params);
        expect(built.ok).toBe(true);
        if (!built.ok) continue;
        const final = lastFrame(built.frames);
        expect(final.phase).toBe(NEGATIVE_CYCLE);
        expect(final.explanation).toMatch(/^Negative cycle: shortest paths are undefined\./);
        const edges = graphOf(final).graph.edges.filter((edge) => (final.highlights.swapped ?? []).includes(`edge:${edge.id}`));
        expect(edges.length).toBeGreaterThan(1);
        // A closed walk: every highlighted edge's head is another one's tail, once each.
        expect(edges.map((edge) => edge.to).sort()).toEqual(edges.map((edge) => edge.from).sort());
        expect(edges.reduce((sum, edge) => sum + (edge.weight ?? 0), 0)).toBeLessThan(0);
      }
    }
  });

  it('walks prev exactly V times before tracing the cycle', () => {
    const params = presetParams('negative-cycle', 12, 3);
    const frames = runFrames(bellmanFord, params);
    const nodes = graphOf(frames[0]).graph.nodes.length;
    expect(frames.filter((frame) => frame.explanation.startsWith('Step ')).length).toBe(nodes);
  });

  it('refuses an undirected graph, saying a negative edge would be a cycle', () => {
    const refused = bellmanFord.build({ g: SAMPLE, directed: '0' });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe(UNDIRECTED_ERROR);
  });
});

describe('bellman-ford: frames', () => {
  it('needs every pass on a chain listed backwards: 1 + (V-1)E + (V-2) + 1 + E + 1 frames', () => {
    const n = 10;
    const g = Array.from({ length: n - 1 }, (_, i) => `${n - 2 - i}-${n - 1 - i}:1`).join(',');
    const e = n - 1;
    const frames = run(g);
    expect(lastFrame(frames).counters.extra.passes).toBe(n - 1);
    expect(frames).toHaveLength(1 + (n - 1) * e + (n - 2) + 1 + e + 1);
  });

  it('holds every structural invariant on every preset', () => {
    expectFrameHygiene(bellmanFord, run(SAMPLE));
    for (const preset of BELLMAN_FORD_PRESETS) expectFrameHygiene(bellmanFord, runFrames(bellmanFord, presetParams(preset.id, 40, 4)));
  });

  it('is deterministic', () => {
    expectDeterministic(bellmanFord, { g: SAMPLE, directed: '1', start: '0' });
  });

  it('honours its input contract', () => {
    expectInputContract(bellmanFord);
  });
});
