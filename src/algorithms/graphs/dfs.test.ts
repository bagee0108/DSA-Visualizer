import { describe, expect, it } from 'vitest';

import { graphPresets, MAX_GRAPH_NODES } from '../../core/graphInput';
import { makeRng } from '../../core/random';
import { expectDeterministic, expectFrameHygiene, expectInputContract, graphOf, lastFrame, runFrames } from '../frameHygiene';
import { dfs } from './dfs';
import { adjacencyOf, finalLabels, referenceDfs, stripIds, sumDegrees } from './graphTestkit';

const SAMPLE = '0-1,0-2,1-3,1-4,2-4,2-5,3-6,4-6,4-7,5-7,6-8,7-8,7-9,10-11';

function run(g: string, extra: Record<string, string> = {}): ReturnType<typeof runFrames> {
  return runFrames(dfs, { g, ...extra });
}

interface Times {
  readonly disc: number;
  readonly fin: number;
}

function times(frames: ReturnType<typeof runFrames>): ReadonlyMap<number, Times> {
  const out = new Map<number, Times>();
  for (const [id, label] of Object.entries(finalLabels(frames))) {
    const [disc, fin] = label.split('/').map(Number);
    out.set(Number(id), { disc: disc ?? 0, fin: fin ?? 0 });
  }
  return out;
}

describe('dfs: discovery order', () => {
  it('matches a reference recursive DFS on the sample, from several starts, with and without restarts', () => {
    for (const start of [0, 4, 9, 10]) {
      for (const forest of ['0', '1']) {
        const frames = run(SAMPLE, { start: String(start), forest });
        const order = stripIds(lastFrame(frames), 'discovered').map(Number);
        expect(order, `start ${start} forest ${forest}`).toEqual(referenceDfs(adjacencyOf(SAMPLE), start, forest === '1'));
      }
    }
  });

  it('matches the reference on every preset up to the node cap', () => {
    for (const preset of graphPresets({ weighted: false })) {
      for (const size of [6, 40, MAX_GRAPH_NODES]) {
        const params: Record<string, string> = { ...preset.build(size, makeRng(size * 3)), forest: '1' };
        const order = stripIds(lastFrame(runFrames(dfs, params)), 'discovered').map(Number);
        expect(order, `${preset.id} @ ${size}`).toEqual(referenceDfs(adjacencyOf(params.g ?? ''), 0, true));
        expect(order).toHaveLength(size);
      }
    }
  });

  it('respects direction', () => {
    const order = stripIds(lastFrame(run('0-1,1-2', { directed: '1', start: '2' })), 'discovered');
    expect(order).toEqual(['2']);
  });
});

describe('dfs: times and the tree', () => {
  it('assigns each node a discovery and a finish time, all distinct, covering 1..2k', () => {
    const frames = run(SAMPLE, { forest: '1' });
    const stamps = times(frames);
    const all = [...stamps.values()].flatMap((t) => [t.disc, t.fin]).sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 2 * stamps.size }, (_, i) => i + 1));
  });

  it('nests intervals: a tree edge child lies strictly inside its parent', () => {
    const frames = run(SAMPLE, { forest: '1' });
    const stamps = times(frames);
    const final = graphOf(lastFrame(frames));
    const byId = new Map(final.graph.edges.map((edge) => [edge.id, edge] as const));
    for (const id of final.treeEdges) {
      const edge = byId.get(id);
      if (edge === undefined) throw new Error(`unknown edge ${id}`);
      const a = stamps.get(Number(edge.from));
      const b = stamps.get(Number(edge.to));
      if (a === undefined || b === undefined) throw new Error('missing times');
      const [parent, child] = a.disc < b.disc ? [a, b] : [b, a];
      expect(child.disc).toBeGreaterThan(parent.disc);
      expect(child.fin).toBeLessThan(parent.fin);
    }
  });

  it('ends with visited - trees tree edges', () => {
    const forest = graphOf(lastFrame(run(SAMPLE, { forest: '1' })));
    expect(forest.treeEdges).toHaveLength(12 - 2);
    const single = graphOf(lastFrame(run(SAMPLE)));
    expect(single.treeEdges).toHaveLength(10 - 1);
    expect(single.visited).toHaveLength(10);
  });

  it('keeps the stack strip equal to the call stack, and the recursion as deep as a path', () => {
    const frames = run(SAMPLE);
    for (const frame of frames) {
      const stack = stripIds(frame, 'stack');
      expect(stack.length).toBe(frame.callStack.length);
      expect(frame.callStack.map((entry) => entry.label)).toEqual(stack.map((id) => `dfs(${id})`));
    }
    const path = Array.from({ length: 30 }, (_, i) => `${i}-${i + 1}`).join(',');
    const deep = run(path);
    expect(Math.max(...deep.map((frame) => frame.callStack.length))).toBe(31);
  });
});

describe('dfs: frames', () => {
  it('spends one frame per discovery, one per finish and one per edge examination, plus two', () => {
    const adj = adjacencyOf(SAMPLE);
    const reached = referenceDfs(adj, 0, false);
    const frames = run(SAMPLE);
    expect(frames).toHaveLength(2 + 2 * reached.length + sumDegrees(adj, reached));
  });

  it('holds every structural invariant, with the recursion bound raised to the node cap', () => {
    expectFrameHygiene(dfs, run(SAMPLE, { forest: '1' }), { maxStackDepth: MAX_GRAPH_NODES + 2 });
    const ring = graphPresets({ weighted: false }).find((preset) => preset.id === 'ring');
    expectFrameHygiene(dfs, runFrames(dfs, ring?.build(150, makeRng(4)) ?? {}), { maxStackDepth: MAX_GRAPH_NODES + 2 });
  });

  it('is deterministic', () => {
    expectDeterministic(dfs, { g: SAMPLE, start: '5', forest: '1' });
  });

  it('honours its input contract', () => {
    expectInputContract(dfs);
    expect(dfs.build({ g: '0-1', start: '9' }).ok).toBe(false);
  });
});
