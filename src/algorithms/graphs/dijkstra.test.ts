import { describe, expect, it } from 'vitest';

import { graphPresets } from '../../core/graphInput';
import { makeRng } from '../../core/random';
import { expectDeterministic, expectFrameHygiene, expectInputContract, graphOf, lastFrame, runFrames } from '../frameHygiene';
import { dijkstra } from './dijkstra';
import { adjacencyOf, finalLabels, reachedCount, referenceDijkstra, stripIds, stripOf } from './graphTestkit';
import { MinHeap } from './minHeap';

const SAMPLE = '0-1:4,0-2:1,2-1:2,1-3:1,2-3:5,3-4:3,2-4:8,4-5:2,3-5:6,6-7:1';

function run(g: string, extra: Record<string, string> = {}): ReturnType<typeof runFrames> {
  return runFrames(dijkstra, { g, ...extra });
}

function labelsAsNumbers(frames: ReturnType<typeof runFrames>): number[] {
  const labels = finalLabels(frames);
  return Object.keys(labels)
    .map(Number)
    .sort((a, b) => a - b)
    .map((id) => (labels[String(id)] === '∞' ? Number.POSITIVE_INFINITY : Number(labels[String(id)])));
}

describe('min-heap', () => {
  it('pops in key order, ties by push order, and keeps the minimum at index 0', () => {
    const heap = new MinHeap();
    const keys = [5, 3, 8, 3, 1, 9, 2, 7];
    for (const [i, key] of keys.entries()) {
      heap.push(key, `n${i}`);
      expect(heap.peek()?.key).toBe(Math.min(...keys.slice(0, i + 1)));
    }
    const out: number[] = [];
    while (heap.size > 0) out.push(heap.pop()?.key ?? -1);
    expect(out).toEqual([...keys].sort((a, b) => a - b));
    const tie = new MinHeap();
    tie.push(1, 'a');
    tie.push(1, 'b');
    expect(tie.pop()?.node).toBe('a');
  });
});

describe('dijkstra: distances', () => {
  it('matches a reference implementation on the sample from every start', () => {
    for (let start = 0; start < 8; start++) {
      const frames = run(SAMPLE, { start: String(start) });
      expect(labelsAsNumbers(frames), `start ${start}`).toEqual(referenceDijkstra(adjacencyOf(SAMPLE), start));
    }
  });

  it('matches the reference on every weighted preset at a few sizes, directed and undirected', () => {
    for (const preset of graphPresets({ weighted: true })) {
      for (const size of [6, 40, 150]) {
        for (const directed of ['0', '1']) {
          const params: Record<string, string> = { ...preset.build(size, makeRng(size + 11)), directed };
          const frames = runFrames(dijkstra, params);
          expect(labelsAsNumbers(frames), `${preset.id} @ ${size} directed=${directed}`).toEqual(
            referenceDijkstra(adjacencyOf(params.g ?? '', directed === '1'), 0),
          );
        }
      }
    }
  });

  it('prefers the cheaper multi-hop path over the direct edge', () => {
    const labels = finalLabels(run(SAMPLE));
    expect(labels['1']).toBe('3');
    expect(labels['4']).toBe('7');
  });
});

describe('dijkstra: the queue and the tree', () => {
  it('settles nodes in non-decreasing distance order', () => {
    const frames = run(SAMPLE);
    const dist = referenceDijkstra(adjacencyOf(SAMPLE), 0);
    const order = stripIds(lastFrame(frames), 'settled').map(Number);
    expect(order).toHaveLength(reachedCount(dist));
    for (let i = 1; i < order.length; i++) expect(dist[order[i] ?? 0]).toBeGreaterThanOrEqual(dist[order[i - 1] ?? 0] ?? 0);
  });

  it('keeps the minimum at the front of the queue strip in every frame', () => {
    for (const frame of run(SAMPLE)) {
      const keys = stripOf(frame, 'priority queue').items.map((item) => Number(item.label.split(':')[1]));
      if (keys.length === 0) continue;
      expect(keys[0]).toBe(Math.min(...keys));
    }
  });

  it('ends with a shortest-path tree: reached - 1 edges, each tight', () => {
    const frames = run(SAMPLE);
    const dist = referenceDijkstra(adjacencyOf(SAMPLE), 0);
    const final = graphOf(lastFrame(frames));
    expect(final.treeEdges).toHaveLength(reachedCount(dist) - 1);
    const byId = new Map(final.graph.edges.map((edge) => [edge.id, edge] as const));
    for (const id of final.treeEdges) {
      const edge = byId.get(id);
      if (edge === undefined) throw new Error(`unknown tree edge ${id}`);
      const [a, b] = [dist[Number(edge.from)] ?? 0, dist[Number(edge.to)] ?? 0];
      expect(Math.abs(a - b)).toBe(edge.weight);
    }
  });

  it('pops every entry it pushed, and the stale ones are exactly the improvements', () => {
    const frames = run(SAMPLE);
    const extra = lastFrame(frames).counters.extra;
    const pushes = (extra.relaxations ?? 0) + 1;
    const pops = (extra['nodes settled'] ?? 0) + (extra['stale pops'] ?? 0);
    expect(pops).toBe(pushes);
    expect(extra['stale pops']).toBe(pushes - (extra['nodes settled'] ?? 0));
  });
});

describe('dijkstra: frames', () => {
  it('holds every structural invariant', () => {
    expectFrameHygiene(dijkstra, run(SAMPLE));
    expectFrameHygiene(dijkstra, runFrames(dijkstra, graphPresets({ weighted: true })[0]?.build(150, makeRng(9)) ?? {}));
  });

  it('is deterministic', () => {
    expectDeterministic(dijkstra, { g: SAMPLE, start: '2' });
  });

  it('honours its input contract and refuses what it cannot handle', () => {
    expectInputContract(dijkstra);
    expect(dijkstra.build({ g: '0-1:-2' }).ok).toBe(false);
    expect(dijkstra.build({ g: '0-1' }).ok).toBe(false);
    expect(dijkstra.build({ g: '0-1:2', start: '3' }).ok).toBe(false);
  });

  it('stays under a thousand frames at the 150-node target on every preset', () => {
    for (const preset of graphPresets({ weighted: true })) {
      expect(runFrames(dijkstra, preset.build(150, makeRng(3))).length, preset.id).toBeLessThan(1000);
    }
  });
});
