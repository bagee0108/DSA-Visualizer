import { describe, expect, it } from 'vitest';

import { MAX_GRAPH_NODES } from '../../core/graphInput';
import { makeRng } from '../../core/random';
import type { Frame } from '../../core/types';
import { expectDeterministic, expectFrameHygiene, expectInputContract, graphOf, lastFrame, runFrames } from '../frameHygiene';
import { adjacencyOf, stripIds, type Adjacency } from './graphTestkit';
import { NOT_A_DAG, TOPO_PRESETS, topologicalSort, UNDIRECTED_ERROR } from './topoSort';

const SAMPLE = '0-1,0-2,1-3,2-3,1-4,3-5,4-5,4-6,2-7,3-7,5-8,6-8';
const METHODS = ['kahn', 'dfs'] as const;
const SIZES = [4, 12, 40, MAX_GRAPH_NODES] as const;

function run(g: string, method: string): Frame[] {
  return [...runFrames(topologicalSort, { g, directed: '1', method })];
}

function presetParams(id: string, size: number, seed: number): Record<string, string> {
  const preset = TOPO_PRESETS.find((candidate) => candidate.id === id);
  if (preset === undefined) throw new Error(`no preset ${id}`);
  return { ...preset.build(size, makeRng(seed)) };
}

function expectValidOrder(order: readonly number[], adj: Adjacency, where: string): void {
  expect([...order].sort((a, b) => a - b), `${where}: every node once`).toEqual(Array.from({ length: adj.nodeCount }, (_, i) => i));
  const position = new Map(order.map((id, i) => [id, i]));
  for (const edge of adj.edges) {
    expect((position.get(edge.from) ?? -1) < (position.get(edge.to) ?? -1), `${where}: ${edge.from}->${edge.to} points backward`).toBe(true);
  }
}

/** Kahn's, taking the smallest ready id each time. */
function referenceKahn(adj: Adjacency): number[] | null {
  const indegree = Array.from({ length: adj.nodeCount }, () => 0);
  for (const edge of adj.edges) indegree[edge.to] = (indegree[edge.to] ?? 0) + 1;
  const ready = indegree.flatMap((d, i) => (d === 0 ? [i] : []));
  const order: number[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => a - b);
    const u = ready.shift() ?? 0;
    order.push(u);
    for (const { to } of adj.out[u] ?? []) {
      indegree[to] = (indegree[to] ?? 0) - 1;
      if (indegree[to] === 0) ready.push(to);
    }
  }
  return order.length === adj.nodeCount ? order : null;
}

/** Reverse post-order of a recursive DFS that restarts in id order and scans neighbours by id. */
function referenceDfsOrder(adj: Adjacency): number[] {
  const seen = new Set<number>();
  const order: number[] = [];
  const go = (u: number): void => {
    seen.add(u);
    for (const { to } of adj.out[u] ?? []) if (!seen.has(to)) go(to);
    order.unshift(u);
  };
  for (let s = 0; s < adj.nodeCount; s++) if (!seen.has(s)) go(s);
  return order;
}

function reaches(adj: Adjacency, from: number, to: number): boolean {
  const seen = new Set([from]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    for (const { to: next } of adj.out[queue[head] ?? 0] ?? []) {
      if (next === to) return true;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return from === to;
}

describe('topological sort: valid orders', () => {
  it('orders the sample so every edge points forward, by both methods', () => {
    const adj = adjacencyOf(SAMPLE, true);
    for (const method of METHODS) {
      const final = lastFrame(run(SAMPLE, method));
      expect(final.phase).toBe('done');
      expectValidOrder(stripIds(final, 'order').map(Number), adj, method);
    }
  });

  it('gives a valid order on every acyclic preset at every size, by both methods', () => {
    for (const preset of TOPO_PRESETS.filter((candidate) => candidate.id !== 'cycle')) {
      for (const size of SIZES) {
        const params = presetParams(preset.id, size, size * 13);
        const adj = adjacencyOf(params.g ?? '', true);
        for (const method of METHODS) {
          const final = lastFrame(runFrames(topologicalSort, { ...params, method }));
          const where = `${preset.id} @ ${size} ${method}`;
          expect(final.phase, where).toBe('done');
          expectValidOrder(stripIds(final, 'order').map(Number), adj, where);
        }
      }
    }
  });

  it("takes the smallest ready id in Kahn's, and reverse post-order in DFS", () => {
    for (const preset of TOPO_PRESETS.filter((candidate) => candidate.id !== 'cycle')) {
      const params = presetParams(preset.id, 40, 5);
      const adj = adjacencyOf(params.g ?? '', true);
      expect(stripIds(lastFrame(runFrames(topologicalSort, { ...params, method: 'kahn' })), 'order').map(Number)).toEqual(referenceKahn(adj));
      expect(stripIds(lastFrame(runFrames(topologicalSort, { ...params, method: 'dfs' })), 'order').map(Number)).toEqual(referenceDfsOrder(adj));
    }
  });

  it('says plainly that this is one of many valid orders when there is a choice', () => {
    const frames = run(SAMPLE, 'kahn');
    expect(frames.some((frame) => frame.explanation.includes('many valid topological orders'))).toBe(true);
  });

  it('labels every node with its in-degree in Kahn\'s, ending at 0', () => {
    const frames = run(SAMPLE, 'kahn');
    const adj = adjacencyOf(SAMPLE, true);
    const first = graphOf(frames[0]).labels;
    for (let v = 0; v < adj.nodeCount; v++) expect(first[String(v)]).toBe(String(adj.edges.filter((edge) => edge.to === v).length));
    expect(Object.values(graphOf(lastFrame(frames)).labels).every((label) => label === '0')).toBe(true);
  });
});

describe('topological sort: cycles', () => {
  it('ends in the not-a-DAG frame on every cycle preset, by both methods, without an error', () => {
    for (const size of SIZES) {
      for (const seed of [1, 2, 3]) {
        const params = presetParams('cycle', size, size * 17 + seed);
        const adj = adjacencyOf(params.g ?? '', true);
        expect(referenceKahn(adj), `cycle @ ${size}: the preset has a cycle`).toBeNull();
        for (const method of METHODS) {
          const built = topologicalSort.build({ ...params, method });
          expect(built.ok).toBe(true);
          if (!built.ok) continue;
          const final = lastFrame(built.frames);
          expect(final.phase, `cycle @ ${size} ${method}`).toBe(NOT_A_DAG);
          expect(final.explanation).toMatch(/^Not a DAG: no topological order exists\./);
          expect(final.callStack).toHaveLength(0);
        }
      }
    }
  });

  it("highlights exactly the nodes Kahn's could never place", () => {
    const params = presetParams('cycle', 40, 9);
    const adj = adjacencyOf(params.g ?? '', true);
    const final = lastFrame(runFrames(topologicalSort, { ...params, method: 'kahn' }));
    const placed = new Set(stripIds(final, 'order'));
    const stuck = Array.from({ length: adj.nodeCount }, (_, i) => String(i)).filter((id) => !placed.has(id));
    expect(stuck.length).toBeGreaterThan(0);
    const swapped = (final.highlights.swapped ?? []).filter((id) => typeof id === 'string' && !id.startsWith('edge:'));
    expect([...swapped].sort()).toEqual([...stuck].sort());
  });

  it('highlights a back edge in DFS that really closes a cycle', () => {
    for (const size of SIZES) {
      const params = presetParams('cycle', size, size);
      const adj = adjacencyOf(params.g ?? '', true);
      const final = lastFrame(runFrames(topologicalSort, { ...params, method: 'dfs' }));
      const edgeRefs = (final.highlights.swapped ?? []).filter((id) => typeof id === 'string' && id.startsWith('edge:'));
      expect(edgeRefs).toHaveLength(1);
      const edge = graphOf(final).graph.edges.find((candidate) => `edge:${candidate.id}` === edgeRefs[0]);
      if (edge === undefined) throw new Error('highlighted edge not in the graph');
      // u -> v closes a cycle exactly when v already reaches u.
      expect(reaches(adj, Number(edge.to), Number(edge.from)), `cycle @ ${size}`).toBe(true);
    }
  });

  it('refuses an undirected graph with a reason', () => {
    const refused = topologicalSort.build({ g: SAMPLE, directed: '0' });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe(UNDIRECTED_ERROR);
  });
});

describe('topological sort: frames', () => {
  it("spends V + E + 3 frames in Kahn's on a DAG", () => {
    const adj = adjacencyOf(SAMPLE, true);
    expect(run(SAMPLE, 'kahn')).toHaveLength(adj.nodeCount + adj.edges.length + 3);
  });

  it('keeps the DFS stack strip equal to the call stack', () => {
    for (const frame of run(SAMPLE, 'dfs')) {
      expect(frame.callStack.map((entry) => entry.label)).toEqual(stripIds(frame, 'stack').map((id) => `visit(${id})`));
    }
  });

  it('holds every structural invariant on every preset, by both methods', () => {
    for (const method of METHODS) {
      expectFrameHygiene(topologicalSort, run(SAMPLE, method), { maxStackDepth: MAX_GRAPH_NODES + 2 });
      for (const preset of TOPO_PRESETS) {
        expectFrameHygiene(topologicalSort, runFrames(topologicalSort, { ...presetParams(preset.id, 40, 4), method }), { maxStackDepth: MAX_GRAPH_NODES + 2 });
      }
    }
    const chain = presetParams('chain', MAX_GRAPH_NODES, 4);
    expectFrameHygiene(topologicalSort, runFrames(topologicalSort, { ...chain, method: 'dfs' }), { maxStackDepth: MAX_GRAPH_NODES + 2 });
  });

  it('is deterministic', () => {
    for (const method of METHODS) expectDeterministic(topologicalSort, { g: SAMPLE, directed: '1', method });
  });

  it('honours its input contract', () => {
    expectInputContract(topologicalSort);
  });
});
