import { describe, expect, it } from 'vitest';

import { graphPresets } from '../../core/graphInput';
import { makeRng } from '../../core/random';
import { expectDeterministic, expectFrameHygiene, expectInputContract, graphOf, lastFrame, runFrames } from '../frameHygiene';
import { bfs } from './bfs';
import { adjacencyOf, finalLabels, reachedCount, referenceBfs, stripIds, sumDegrees } from './graphTestkit';

const SAMPLE = '0-1,0-2,1-3,1-4,2-4,2-5,3-6,4-6,4-7,5-7,6-8,7-8,7-9,10-11';

function run(g: string, extra: Record<string, string> = {}): ReturnType<typeof runFrames> {
  return runFrames(bfs, { g, ...extra });
}

function labelsAsNumbers(frames: ReturnType<typeof runFrames>): number[] {
  const labels = finalLabels(frames);
  return Object.keys(labels)
    .map(Number)
    .sort((a, b) => a - b)
    .map((id) => (labels[String(id)] === '∞' ? Number.POSITIVE_INFINITY : Number(labels[String(id)])));
}

describe('bfs: distances', () => {
  it('matches a reference BFS on the sample, from several starts', () => {
    for (const start of [0, 4, 9, 10]) {
      const frames = run(SAMPLE, { start: String(start) });
      expect(labelsAsNumbers(frames)).toEqual(referenceBfs(adjacencyOf(SAMPLE), start));
    }
  });

  it('matches the reference on every preset at a few sizes', () => {
    for (const preset of graphPresets({ weighted: false })) {
      for (const size of [6, 40, 150]) {
        const params = preset.build(size, makeRng(size * 7));
        const frames = runFrames(bfs, params);
        expect(labelsAsNumbers(frames), `${preset.id} @ ${size}`).toEqual(referenceBfs(adjacencyOf(params.g ?? ''), 0));
      }
    }
  });

  it('respects direction', () => {
    const directed = run('0-1,1-2', { directed: '1', start: '2' });
    expect(labelsAsNumbers(directed)).toEqual([Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, 0]);
    const undirected = run('0-1,1-2', { start: '2' });
    expect(labelsAsNumbers(undirected)).toEqual([2, 1, 0]);
  });

  it('leaves unreachable nodes at infinity and says so', () => {
    const frames = run(SAMPLE);
    const labels = finalLabels(frames);
    expect(labels['10']).toBe('∞');
    expect(labels['11']).toBe('∞');
    expect(lastFrame(frames).explanation).toContain('2 stay at ∞');
  });
});

describe('bfs: the queue and the tree', () => {
  it('dequeues in non-decreasing distance order', () => {
    const frames = run(SAMPLE);
    const dist = referenceBfs(adjacencyOf(SAMPLE), 0);
    const order = stripIds(lastFrame(frames), 'visited').map(Number);
    expect(order).toHaveLength(reachedCount(dist));
    for (let i = 1; i < order.length; i++) {
      expect(dist[order[i] ?? 0]).toBeGreaterThanOrEqual(dist[order[i - 1] ?? 0] ?? 0);
    }
  });

  it('every queue snapshot holds at most two consecutive layers', () => {
    const frames = run(SAMPLE);
    const dist = referenceBfs(adjacencyOf(SAMPLE), 0);
    for (const frame of frames) {
      const layers = new Set(stripIds(frame, 'queue').map((id) => dist[Number(id)]));
      expect(layers.size).toBeLessThanOrEqual(2);
      if (layers.size === 2) {
        const [a, b] = [...layers].sort((x, y) => (x ?? 0) - (y ?? 0));
        expect((b ?? 0) - (a ?? 0)).toBe(1);
      }
    }
  });

  it('ends with reached - 1 tree edges, each linking layer d to d + 1', () => {
    const frames = run(SAMPLE);
    const dist = referenceBfs(adjacencyOf(SAMPLE), 0);
    const final = graphOf(lastFrame(frames));
    expect(final.treeEdges).toHaveLength(reachedCount(dist) - 1);
    const byId = new Map(final.graph.edges.map((edge) => [edge.id, edge] as const));
    for (const id of final.treeEdges) {
      const edge = byId.get(id);
      if (edge === undefined) throw new Error(`unknown tree edge ${id}`);
      const [a, b] = [dist[Number(edge.from)] ?? 0, dist[Number(edge.to)] ?? 0];
      expect(Math.abs(a - b)).toBe(1);
    }
  });

  it('never marks a node visited twice: the visited count only grows by one per discovery frame', () => {
    const frames = run(SAMPLE);
    let previous = 0;
    for (const frame of frames) {
      const count = graphOf(frame).visited.length;
      expect(count - previous).toBeLessThanOrEqual(1);
      previous = count;
    }
  });
});

describe('bfs: frames', () => {
  it('spends one frame per dequeue and one per edge examination, plus two', () => {
    const adj = adjacencyOf(SAMPLE);
    const dist = referenceBfs(adj, 0);
    const reached = dist.map((d, i) => (Number.isFinite(d) ? i : -1)).filter((i) => i >= 0);
    const frames = run(SAMPLE);
    expect(frames).toHaveLength(2 + reached.length + sumDegrees(adj, reached));
  });

  it('holds every structural invariant, including one shared Graph per run', () => {
    expectFrameHygiene(bfs, run(SAMPLE));
    expectFrameHygiene(bfs, runFrames(bfs, graphPresets({ weighted: false })[1]?.build(150, makeRng(2)) ?? {}));
  });

  it('is deterministic', () => {
    expectDeterministic(bfs, { g: SAMPLE, start: '3' });
  });

  it('honours its input contract and rejects a bad start', () => {
    expectInputContract(bfs);
    expect(bfs.build({ g: '0-1', start: '5' }).ok).toBe(false);
    expect(bfs.build({ g: '0-1', start: '-1' }).ok).toBe(false);
    expect(bfs.build({ g: 'x' }).ok).toBe(false);
  });

  it('stays under a thousand frames at the 150-node target on every preset', () => {
    for (const preset of graphPresets({ weighted: false })) {
      const frames = runFrames(bfs, preset.build(150, makeRng(11)));
      expect(frames.length, preset.id).toBeLessThan(1000);
    }
  });
});
