import { describe, expect, it } from 'vitest';

import { MAX_GRAPH_NODES } from '../../core/graphInput';
import { makeRng } from '../../core/random';
import type { Frame } from '../../core/types';
import { expectDeterministic, expectFrameHygiene, expectInputContract, graphOf, lastFrame, runFrames } from '../frameHygiene';
import { adjacencyOf, referenceForest, stripIds } from './graphTestkit';
import { kruskal } from './kruskal';
import { DIRECTED_ERROR } from './mst';
import { PRIM_PRESETS, prim } from './prim';

const TEXTBOOK = '0-1:4,0-7:8,1-2:8,1-7:11,2-3:7,2-5:4,2-8:2,3-4:9,3-5:14,4-5:10,5-6:2,6-7:1,6-8:6,7-8:7';
const SIZES = [4, 6, 12, 40, MAX_GRAPH_NODES] as const;

function presetParams(id: string, size: number, seed: number): Record<string, string> {
  const preset = PRIM_PRESETS.find((candidate) => candidate.id === id);
  if (preset === undefined) throw new Error(`no preset ${id}`);
  return { ...preset.build(size, makeRng(seed)) };
}

function treeWeight(final: Frame): number {
  const snapshot = graphOf(final);
  const byId = new Map(snapshot.graph.edges.map((edge) => [edge.id, edge.weight ?? 0]));
  return snapshot.treeEdges.reduce((sum, id) => sum + (byId.get(id) ?? 0), 0);
}

describe('prim: the tree', () => {
  it('finds the textbook tree of weight 37', () => {
    const final = lastFrame(runFrames(prim, { g: TEXTBOOK }));
    expect(treeWeight(final)).toBe(37);
    expect(graphOf(final).treeEdges).toHaveLength(8);
  });

  it("matches a reference minimum spanning forest, and Kruskal's total, on every shared preset at every size", () => {
    for (const preset of PRIM_PRESETS) {
      for (const size of SIZES) {
        const params = presetParams(preset.id, size, size * 23);
        const adj = adjacencyOf(params.g ?? '');
        const want = referenceForest(adj);
        const final = lastFrame(runFrames(prim, params));
        const where = `${preset.id} @ ${size}`;
        expect(treeWeight(final), where).toBe(want.weight);
        expect(treeWeight(final), `${where} vs Kruskal`).toBe(treeWeight(lastFrame(runFrames(kruskal, params))));
        expect(graphOf(final).treeEdges, where).toHaveLength(adj.nodeCount - want.trees);
        expect(graphOf(final).visited, where).toHaveLength(adj.nodeCount);
      }
    }
  });

  it('gives the same total from any start node', () => {
    const totals = new Set(Array.from({ length: 9 }, (_, start) => treeWeight(lastFrame(runFrames(prim, { g: TEXTBOOK, start: String(start) })))));
    expect([...totals]).toEqual([37]);
  });

  it('takes, at every join, the lightest edge across the cut between the tree and the rest', () => {
    for (const preset of PRIM_PRESETS) {
      const frames = runFrames(prim, presetParams(preset.id, 40, 7));
      const edges = graphOf(frames[0]).graph.edges;
      let joins = 0;
      frames.forEach((frame, i) => {
        const before = new Set(graphOf(frames[i - 1] ?? frame).visited);
        const after = graphOf(frame).visited;
        if (after.length !== before.size + 1) return;
        const u = after.find((id) => !before.has(id)) ?? '';
        const taken = graphOf(frame).treeEdges.find((id) => !graphOf(frames[i - 1] ?? frame).treeEdges.includes(id));
        if (taken === undefined) return; // a root, joining with no edge
        joins += 1;
        const crossing = edges.filter((edge) => before.has(edge.from) !== before.has(edge.to));
        const lightest = Math.min(...crossing.map((edge) => edge.weight ?? 0));
        const edge = edges.find((candidate) => candidate.id === taken);
        expect(edge?.weight, `${preset.id}: ${u} joins`).toBe(lightest);
        expect([edge?.from, edge?.to]).toContain(u);
      });
      expect(joins, preset.id).toBeGreaterThan(0);
    }
  });

  it('builds a spanning forest on disconnected input, and says so', () => {
    const frames = runFrames(prim, presetParams('disconnected', 12, 1));
    expect(frames.some((frame) => frame.explanation.startsWith('The queue is empty, but'))).toBe(true);
    const final = lastFrame(frames);
    expect(final.explanation).toContain('not connected');
    expect(final.explanation).toContain('spanning forest');
  });

  it('refuses a directed graph with a reason', () => {
    const refused = prim.build({ g: TEXTBOOK, directed: '1' });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe(DIRECTED_ERROR);
  });

  it('handles negative weights, which an MST allows', () => {
    const final = lastFrame(runFrames(prim, { g: '0-1:-3,1-2:2,0-2:1' }));
    expect(treeWeight(final)).toBe(-2);
  });
});

describe('prim: the queue', () => {
  it('keeps the priority queue strip a min-heap in array order, and extracts its minimum', () => {
    const frames = runFrames(prim, presetParams('dense', 40, 3));
    for (const frame of frames) {
      const keys = (graphOf(frame).strips.find((strip) => strip.label === 'priority queue')?.items ?? []).map((item) => Number(item.label.split(':')[1]?.replace('−', '-')));
      keys.forEach((key, i) => {
        if (i > 0) expect(key).toBeGreaterThanOrEqual(keys[Math.floor((i - 1) / 2)] ?? -Infinity);
      });
    }
  });

  it('skips stale entries on dense graphs, and only ones whose node is already in the tree', () => {
    const frames = runFrames(prim, presetParams('dense', 40, 3));
    const stale = frames.filter((frame) => frame.explanation.includes('is already in the tree: it joined through a cheaper edge'));
    expect(stale.length).toBeGreaterThan(0);
    for (const frame of stale) {
      const u = (frame.pointers as Record<string, string>).u ?? '';
      expect(graphOf(frame).visited).toContain(u);
    }
  });

  it('labels each node with its key: the cheapest edge known from the tree', () => {
    const frames = runFrames(prim, { g: TEXTBOOK });
    expect(graphOf(frames[0]).labels['0']).toBe('0');
    expect(graphOf(frames[0]).labels['5']).toBe('∞');
    // After 0 joins, 1 is reached by 0-1 (4) and 7 by 0-7 (8).
    const afterZero = frames.find((frame) => graphOf(frame).labels['7'] === '8');
    expect(afterZero).toBeDefined();
    expect(graphOf(afterZero as Frame).labels['1']).toBe('4');
  });

  it('lists tree edges in the order they were taken, and counts them in the phase', () => {
    const frames = runFrames(prim, { g: TEXTBOOK });
    expect(stripIds(lastFrame(frames), 'tree edges')).toEqual(graphOf(lastFrame(frames)).treeEdges);
    for (const frame of frames) if (frame.phase !== 'done') expect(frame.phase).toMatch(/^[0-8] of 8 taken$/);
  });
});

describe('prim: frames', () => {
  it('holds every structural invariant on every preset', () => {
    expectFrameHygiene(prim, runFrames(prim, { g: TEXTBOOK }));
    for (const preset of PRIM_PRESETS) expectFrameHygiene(prim, runFrames(prim, presetParams(preset.id, 40, 4)));
  });

  it('keeps frame counts near two per edge, plus the pops', () => {
    for (const preset of PRIM_PRESETS) {
      const params = presetParams(preset.id, MAX_GRAPH_NODES, 2);
      const edges = adjacencyOf(params.g ?? '').edges.length;
      const frames = runFrames(prim, params).length;
      expect(frames, preset.id).toBeLessThanOrEqual(4 * edges + 2 * MAX_GRAPH_NODES + 2);
    }
  });

  it('is deterministic', () => {
    expectDeterministic(prim, { g: TEXTBOOK });
  });

  it('honours its input contract', () => {
    expectInputContract(prim);
  });
});
