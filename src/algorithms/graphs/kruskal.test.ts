import { describe, expect, it } from 'vitest';

import { MAX_GRAPH_NODES } from '../../core/graphInput';
import { makeRng } from '../../core/random';
import type { Frame } from '../../core/types';
import { expectDeterministic, expectFrameHygiene, expectInputContract, graphOf, lastFrame, runFrames } from '../frameHygiene';
import { adjacencyOf, referenceForest, stripIds } from './graphTestkit';
import { KRUSKAL_PRESETS, kruskal } from './kruskal';
import { DIRECTED_ERROR } from './mst';

const TEXTBOOK = '0-1:4,0-7:8,1-2:8,1-7:11,2-3:7,2-5:4,2-8:2,3-4:9,3-5:14,4-5:10,5-6:2,6-7:1,6-8:6,7-8:7';
const SIZES = [4, 6, 12, 40, MAX_GRAPH_NODES] as const;

function presetParams(id: string, size: number, seed: number): Record<string, string> {
  const preset = KRUSKAL_PRESETS.find((candidate) => candidate.id === id);
  if (preset === undefined) throw new Error(`no preset ${id}`);
  return { ...preset.build(size, makeRng(seed)) };
}

function acceptedOf(final: Frame): string[] {
  return [...graphOf(final).treeEdges];
}

function weightOf(final: Frame, ids: readonly string[]): number {
  const byId = new Map(graphOf(final).graph.edges.map((edge) => [edge.id, edge.weight ?? 0]));
  return ids.reduce((sum, id) => sum + (byId.get(id) ?? 0), 0);
}

/** Follows the parent arrows drawn in a frame up to a root. */
function rootIn(frame: Frame, node: string): string {
  const parent = new Map(graphOf(frame).links.map((link) => [link.from, link.to]));
  let at = node;
  for (let guard = 0; parent.has(at) && guard < 1000; guard++) at = parent.get(at) ?? at;
  return at;
}

describe('kruskal: the tree', () => {
  it('finds the textbook tree of weight 37', () => {
    const final = lastFrame(runFrames(kruskal, { g: TEXTBOOK }));
    expect(weightOf(final, acceptedOf(final))).toBe(37);
    expect(acceptedOf(final)).toHaveLength(8);
  });

  it('matches a reference minimum spanning forest on every preset at every size', () => {
    for (const preset of KRUSKAL_PRESETS) {
      for (const size of SIZES) {
        const params = presetParams(preset.id, size, size * 19);
        const adj = adjacencyOf(params.g ?? '');
        const want = referenceForest(adj);
        const final = lastFrame(runFrames(kruskal, params));
        const accepted = acceptedOf(final);
        const where = `${preset.id} @ ${size}`;
        expect(weightOf(final, accepted), where).toBe(want.weight);
        expect(accepted, where).toHaveLength(adj.nodeCount - want.trees);
      }
    }
  });

  it('accepts an acyclic set of exactly V - c edges', () => {
    for (const preset of KRUSKAL_PRESETS) {
      const params = presetParams(preset.id, 40, 3);
      const final = lastFrame(runFrames(kruskal, params));
      const adj = adjacencyOf(params.g ?? '');
      const byId = new Map(graphOf(final).graph.edges.map((edge) => [edge.id, edge]));
      const parent = Array.from({ length: adj.nodeCount }, (_, i) => i);
      const root = (x: number): number => (parent[x] === x ? x : root(parent[x] ?? x));
      for (const id of acceptedOf(final)) {
        const edge = byId.get(id);
        if (edge === undefined) throw new Error(`unknown edge ${id}`);
        const [a, b] = [root(Number(edge.from)), root(Number(edge.to))];
        expect(a, `${preset.id}: ${edge.from}-${edge.to} closes a cycle`).not.toBe(b);
        parent[a] = b;
      }
      expect(acceptedOf(final)).toHaveLength(adj.nodeCount - referenceForest(adj).trees);
    }
  });

  it('says when the input is disconnected and the result is a spanning forest', () => {
    const final = lastFrame(runFrames(kruskal, presetParams('disconnected', 12, 1)));
    expect(final.explanation).toContain('not connected');
    expect(final.explanation).toContain('spanning forest');
  });
});

describe('kruskal: each step', () => {
  it('rejects only edges whose ends already share a root, as drawn in that very frame, and says so', () => {
    for (const preset of KRUSKAL_PRESETS) {
      const frames = runFrames(kruskal, presetParams(preset.id, 40, 8));
      const rejections = frames.filter((frame) => (frame.highlights.swapped ?? []).length > 0);
      expect(rejections.length, preset.id).toBeGreaterThan(0);
      for (const frame of rejections) {
        const { u, v, root } = frame.pointers as Record<string, string>;
        expect(rootIn(frame, u ?? '')).toBe(root);
        expect(rootIn(frame, v ?? '')).toBe(root);
        expect(frame.explanation).toBe(`${u} and ${v} already share root ${root}: this edge would close a cycle.`);
      }
    }
  });

  it('draws a rejected edge as swapped in its rejection frame only', () => {
    const frames = runFrames(kruskal, { g: TEXTBOOK });
    frames.forEach((frame, i) => {
      const swapped = frame.highlights.swapped ?? [];
      if (swapped.length === 0) return;
      expect(frame.explanation).toContain('would close a cycle');
      const next = frames[i + 1];
      for (const ref of swapped) expect(next?.highlights.swapped ?? []).not.toContain(ref);
    });
  });

  it('marks the current edge first in the sorted strip, sorted by weight with ties by endpoints', () => {
    const frames = runFrames(kruskal, { g: TEXTBOOK });
    const first = graphOf(frames[0]);
    const order = stripIds(frames[0] as Frame, 'sorted edges');
    const byId = new Map(first.graph.edges.map((edge) => [edge.id, edge]));
    const keys = order.map((id) => {
      const edge = byId.get(id);
      const [a, b] = [Number(edge?.from), Number(edge?.to)].sort((x, y) => x - y);
      return [edge?.weight ?? 0, a ?? 0, b ?? 0] as const;
    });
    for (let i = 1; i < keys.length; i++) {
      const [w0, a0, b0] = keys[i - 1] ?? [0, 0, 0];
      const [w1, a1, b1] = keys[i] ?? [0, 0, 0];
      expect(w0 < w1 || (w0 === w1 && (a0 < a1 || (a0 === a1 && b0 < b1)))).toBe(true);
    }
    for (const frame of frames) {
      const marked = (frame.highlights.active ?? []).filter((id) => typeof id === 'string' && id.startsWith('queue:'));
      if (marked.length === 0) continue;
      expect(marked).toEqual([`queue:${stripIds(frame, 'sorted edges')[0]}`]);
    }
  });

  it('notes that tied weights can mean more than one minimum tree', () => {
    expect(runFrames(kruskal, { g: TEXTBOOK })[0]?.explanation).toContain('may not be the only minimum one');
    expect(runFrames(kruskal, { g: '0-1:1,1-2:2,2-3:3' })[0]?.explanation).toContain('unique');
  });

  it('stops early once V - c edges are taken, and says so', () => {
    const frames = runFrames(kruskal, { g: TEXTBOOK });
    const stop = frames.find((frame) => frame.explanation.includes('Stop early'));
    expect(stop).toBeDefined();
    // The textbook's two heaviest edges, 11 and 14, are never looked at.
    expect(frames.some((frame) => frame.explanation.startsWith('1-7 (11)') || frame.explanation.startsWith('3-5 (14)'))).toBe(false);
  });

  it('counts accepted edges in the phase as k of V - c', () => {
    for (const frame of runFrames(kruskal, { g: TEXTBOOK })) {
      if (frame.phase !== 'done') expect(frame.phase).toMatch(/^[0-8] of 8 accepted$/);
    }
  });

  it('refuses a directed graph with a reason', () => {
    const refused = kruskal.build({ g: TEXTBOOK, directed: '1' });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe(DIRECTED_ERROR);
  });
});

describe('kruskal: frames', () => {
  it('holds every structural invariant on every preset', () => {
    expectFrameHygiene(kruskal, runFrames(kruskal, { g: TEXTBOOK }));
    for (const preset of KRUSKAL_PRESETS) expectFrameHygiene(kruskal, runFrames(kruskal, presetParams(preset.id, 40, 4)));
  });

  it('is deterministic', () => {
    expectDeterministic(kruskal, { g: TEXTBOOK });
  });

  it('honours its input contract', () => {
    expectInputContract(kruskal);
  });
});
