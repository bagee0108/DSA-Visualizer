import { describe, expect, it } from 'vitest';

import { makeRng } from '../../core/random';
import type { GraphSnapshot } from '../../core/types';
import { expectDeterministic, expectFrameHygiene, expectInputContract, graphOf, lastFrame, runFrames } from '../frameHygiene';
import { adjacencyOf } from './graphTestkit';
import { unionFind } from './unionFind';

const SAMPLE = '0-1,2-3,0-2,4-5,6-7,4-6,0-4,8-9,1-9,3-5';

function run(g: string, extra: Record<string, string> = {}): ReturnType<typeof runFrames> {
  return runFrames(unionFind, { g, ...extra });
}

/** Connected components of the union requests, as a canonical partition. */
function referenceComponents(g: string): string[][] {
  const adj = adjacencyOf(g);
  const seen = Array.from({ length: adj.nodeCount }, () => false);
  const out: string[][] = [];
  for (let s = 0; s < adj.nodeCount; s++) {
    if (seen[s] === true) continue;
    const members: number[] = [];
    const stack = [s];
    seen[s] = true;
    while (stack.length > 0) {
      const u = stack.pop();
      if (u === undefined) break;
      members.push(u);
      for (const { to } of adj.out[u] ?? []) {
        if (seen[to] === true) continue;
        seen[to] = true;
        stack.push(to);
      }
    }
    out.push(members.sort((a, b) => a - b).map(String));
  }
  return out.sort((a, b) => Number(a[0]) - Number(b[0]));
}

/** The forest a frame draws, as parent pointers; roots point at themselves. */
function forestOf(snapshot: GraphSnapshot): ReadonlyMap<string, string> {
  const parent = new Map<string, string>(snapshot.graph.nodes.map((node) => [node.id, node.id] as const));
  for (const link of snapshot.links) parent.set(link.from, link.to);
  return parent;
}

function rootOf(parent: ReadonlyMap<string, string>, x: string): string {
  let cur = x;
  for (let hops = 0; hops < 1000; hops++) {
    const next = parent.get(cur) ?? cur;
    if (next === cur) return cur;
    cur = next;
  }
  throw new Error('cycle in forest');
}

function partitionOf(snapshot: GraphSnapshot): string[][] {
  const parent = forestOf(snapshot);
  const groups = new Map<string, string[]>();
  for (const node of snapshot.graph.nodes) {
    const root = rootOf(parent, node.id);
    const group = groups.get(root) ?? [];
    group.push(node.id);
    groups.set(root, group);
  }
  return [...groups.values()].map((g) => g.sort((a, b) => Number(a) - Number(b))).sort((a, b) => Number(a[0]) - Number(b[0]));
}

function depthOf(parent: ReadonlyMap<string, string>, x: string): number {
  let cur = x;
  let hops = 0;
  while ((parent.get(cur) ?? cur) !== cur) {
    cur = parent.get(cur) ?? cur;
    hops += 1;
  }
  return hops;
}

describe('union-find: sets', () => {
  it('ends with exactly the connected components of the union requests', () => {
    for (const rank of ['1', '0']) {
      for (const compress of ['1', '0']) {
        const final = graphOf(lastFrame(run(SAMPLE, { rank, compress })));
        expect(partitionOf(final), `rank=${rank} compress=${compress}`).toEqual(referenceComponents(SAMPLE));
      }
    }
  });

  it('does so on every preset up to 150 nodes', () => {
    for (const preset of unionFind.presets) {
      const params = preset.build(150, makeRng(21));
      const final = graphOf(lastFrame(runFrames(unionFind, params)));
      expect(partitionOf(final), preset.id).toEqual(referenceComponents(params.g ?? ''));
    }
  });

  it('counts merges as nodes minus sets, and marks exactly those requests as tree edges', () => {
    const last = lastFrame(run(SAMPLE));
    const components = referenceComponents(SAMPLE).length;
    expect(last.counters.extra.merges).toBe(10 - components);
    expect(graphOf(last).treeEdges).toHaveLength(10 - components);
    expect(last.explanation).toContain(`${components} set`);
  });
});

describe('union-find: rank and compression', () => {
  it('never lets a by-rank tree exceed log2(n) depth, in any frame', () => {
    for (const preset of unionFind.presets) {
      const params = preset.build(64, makeRng(8));
      const frames = runFrames(unionFind, params);
      for (const frame of frames) {
        const parent = forestOf(graphOf(frame));
        for (const node of graphOf(frame).graph.nodes) {
          expect(depthOf(parent, node.id), `${preset.id}: depth of ${node.id}`).toBeLessThanOrEqual(6);
        }
      }
    }
  });

  it('builds the deepest tree on the binomial preset and flattens the path on find', () => {
    const params = unionFind.presets.find((preset) => preset.id === 'binomial')?.build(32, makeRng(1)) ?? {};
    const frames = runFrames(unionFind, params);
    const findStart = frames.findIndex((frame) => frame.phase === 'find');
    expect(findStart).toBeGreaterThan(0);
    const before = forestOf(graphOf(frames[findStart] ?? lastFrame(frames)));
    expect(depthOf(before, '31')).toBe(5);
    const after = forestOf(graphOf(lastFrame(frames)));
    expect(depthOf(after, '31')).toBe(1);
    expect(lastFrame(frames).counters.extra['pointers compressed']).toBe(4);
  });

  it('leaves paths alone with compression off', () => {
    const params = { ...(unionFind.presets.find((preset) => preset.id === 'binomial')?.build(32, makeRng(1)) ?? {}), compress: '0' };
    const frames = runFrames(unionFind, params);
    expect(depthOf(forestOf(graphOf(lastFrame(frames))), '31')).toBe(5);
    expect(lastFrame(frames).counters.extra['pointers compressed']).toBeUndefined();
  });

  it('can grow a chain with naive union and no compression', () => {
    const chain = Array.from({ length: 7 }, (_, i) => `${i + 1}-${i}`).join(',');
    const frames = run(chain, { rank: '0', compress: '0' });
    expect(depthOf(forestOf(graphOf(lastFrame(frames))), '0')).toBe(7);
    const ranked = run(chain, { rank: '1', compress: '0' });
    expect(depthOf(forestOf(graphOf(lastFrame(ranked))), '0')).toBeLessThanOrEqual(3);
  });

  it('labels every root with its rank and nothing else', () => {
    for (const frame of run(SAMPLE)) {
      const snapshot = graphOf(frame);
      const parent = forestOf(snapshot);
      for (const node of snapshot.graph.nodes) {
        const isRoot = (parent.get(node.id) ?? node.id) === node.id;
        expect(snapshot.labels[node.id] !== undefined, `${node.id} labelled iff root`).toBe(isRoot);
      }
    }
  });
});

describe('union-find: frames', () => {
  it('holds every structural invariant', () => {
    expectFrameHygiene(unionFind, run(SAMPLE, { finds: '9,3' }));
    expectFrameHygiene(unionFind, runFrames(unionFind, unionFind.presets[1]?.build(150, makeRng(2)) ?? {}));
  });

  it('shows find and union on the call stack, and empties it between requests', () => {
    const frames = run(SAMPLE);
    expect(frames.some((frame) => frame.callStack.length === 2 && frame.callStack[1]?.label.startsWith('find('))).toBe(true);
    expect(frames.filter((frame) => frame.phase === 'init' || frame.phase === 'done').every((frame) => frame.callStack.length === 0)).toBe(true);
  });

  it('is deterministic', () => {
    expectDeterministic(unionFind, { g: SAMPLE, finds: '9' });
  });

  it('honours its input contract and validates finds', () => {
    expectInputContract(unionFind);
    expect(unionFind.build({ g: '0-1', finds: '5' }).ok).toBe(false);
    expect(unionFind.build({ g: '0-1', finds: 'x' }).ok).toBe(false);
  });

  it('stays under two thousand frames at the 150-node target on every preset', () => {
    for (const preset of unionFind.presets) {
      expect(runFrames(unionFind, preset.build(150, makeRng(6))).length, preset.id).toBeLessThan(2000);
    }
  });
});
