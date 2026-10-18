import { describe, expect, it } from 'vitest';

import type { Graph, GraphEdge } from '../core/types';
import { graphBandBottom, graphGeometry, RECIPROCAL_BOW_MAX } from './GraphRenderer';

const BOTTOM = graphBandBottom(0);

function graph(directed: boolean, edges: readonly [string, string][]): Graph {
  return {
    directed,
    weighted: true,
    nodes: [
      { id: '0', label: '0', x: 0.2, y: 0.3 },
      { id: '1', label: '1', x: 0.7, y: 0.3 },
      { id: '2', label: '2', x: 0.45, y: 0.5 },
    ],
    edges: edges.map(([from, to], i): GraphEdge => ({ id: `e${i}`, from, to, weight: i + 1 })),
  };
}

function edge(g: Graph, id: string) {
  const found = graphGeometry(g, BOTTOM).edges.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no edge ${id}`);
  return found;
}

describe('reciprocal directed edges', () => {
  it('bows both edges of a pair, to opposite sides', () => {
    const g = graph(true, [['0', '1'], ['1', '0']]);
    const there = edge(g, 'e0');
    const back = edge(g, 'e1');
    expect(there.curve).not.toBeNull();
    expect(back.curve).not.toBeNull();
    // Both sit on the vertical through the pair's midpoint, one above and one below.
    const midY = graphGeometry(g, BOTTOM).positions.get('0')?.y ?? 0;
    expect(Math.sign((there.curve?.y ?? 0) - midY)).toBe(-Math.sign((back.curve?.y ?? 0) - midY));
    // The weight labels move apart with the curves.
    expect(Math.abs(there.my - back.my)).toBeGreaterThan(RECIPROCAL_BOW_MAX);
  });

  it('starts and ends each curve on the node rims', () => {
    const g = graph(true, [['0', '1'], ['1', '0']]);
    const { positions, radius } = graphGeometry(g, BOTTOM);
    const a = positions.get('0');
    const b = positions.get('1');
    const there = edge(g, 'e0');
    expect(Math.hypot(there.x1 - (a?.x ?? 0), there.y1 - (a?.y ?? 0))).toBeCloseTo(radius + 1, 6);
    expect(Math.hypot(there.x2 - (b?.x ?? 0), there.y2 - (b?.y ?? 0))).toBeCloseTo(radius + 5, 6);
  });

  it('leaves a one-way edge straight, exactly as before', () => {
    const g = graph(true, [['0', '1'], ['1', '0'], ['0', '2']]);
    const lone = edge(g, 'e2');
    expect(lone.curve).toBeNull();
    const { positions, radius } = graphGeometry(g, BOTTOM);
    const a = positions.get('0');
    const b = positions.get('2');
    expect(lone.mx).toBeCloseTo(((a?.x ?? 0) + (b?.x ?? 0)) / 2, 9);
    expect(Math.hypot(lone.x2 - (b?.x ?? 0), lone.y2 - (b?.y ?? 0))).toBeCloseTo(radius + 5, 6);
  });

  it('never bows an undirected edge', () => {
    const g = graph(false, [['0', '1'], ['1', '0'], ['0', '2']]);
    expect(graphGeometry(g, BOTTOM).edges.every((candidate) => candidate.curve === null)).toBe(true);
  });
});
