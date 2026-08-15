import { describe, expect, it } from 'vitest';

import { buildGraph, formatEdgeList, graphPresets, graphSizeOf, parseEdgeList, parseStart } from './graphInput';
import { makeRng } from './random';

describe('edge list parsing', () => {
  it('reads edges, weights and isolated nodes', () => {
    const parsed = parseEdgeList('0-1, 1-2:5\n7');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.nodeCount).toBe(8);
    expect(parsed.value.edges).toEqual([{ from: 0, to: 1 }, { from: 1, to: 2, weight: 5 }]);
  });

  it('rejects garbage, self-loops and half-weighted lists', () => {
    expect(parseEdgeList('a-b').ok).toBe(false);
    expect(parseEdgeList('3-3').ok).toBe(false);
    const mixed = parseEdgeList('0-1:2, 1-2');
    expect(mixed.ok && mixed.value.weighted).toBe(false);
    expect(parseEdgeList('').ok).toBe(false);
    expect(parseEdgeList('0-1', { requireWeights: true }).ok).toBe(false);
  });

  it('drops a repeated undirected edge but keeps both directions of a directed one', () => {
    const undirected = parseEdgeList('0-1, 1-0');
    const directed = parseEdgeList('0-1, 1-0', { directed: true });
    expect(undirected.ok && undirected.value.edges.length).toBe(1);
    expect(directed.ok && directed.value.edges.length).toBe(2);
  });

  it('round-trips through the formatter', () => {
    const text = formatEdgeList([{ from: 0, to: 1 }, { from: 1, to: 2, weight: 3 }], [5]);
    expect(text).toBe('0-1,1-2:3,5');
    const back = parseEdgeList(text);
    expect(back.ok && back.value.nodeCount).toBe(6);
  });

  it('validates the start node against the node count', () => {
    expect(parseStart('2', 3).ok).toBe(true);
    expect(parseStart('3', 3).ok).toBe(false);
    expect(parseStart('-1', 3).ok).toBe(false);
    expect(parseStart(undefined, 3)).toEqual({ ok: true, value: 0 });
  });

  it('sizes the slider by node count, not token count', () => {
    expect(graphSizeOf({ g: '0-1,1-2,9' })).toBe(10);
    expect(graphSizeOf({ g: 'nonsense' })).toBe(0);
  });
});

describe('graph presets', () => {
  it('build parseable lists whose node count is the requested size, at both ends of the range', () => {
    for (const weighted of [false, true]) {
      for (const preset of graphPresets({ weighted })) {
        for (const size of [4, 37, 150]) {
          const params = preset.build(size, makeRng(size));
          const parsed = parseEdgeList(params.g ?? '', { requireWeights: weighted });
          expect(parsed.ok, `${preset.id} @ ${size}`).toBe(true);
          if (!parsed.ok) continue;
          expect(parsed.value.nodeCount, `${preset.id} @ ${size} nodes`).toBe(size);
          expect(parsed.value.weighted).toBe(weighted);
        }
      }
    }
  });

  it('stay under the URL cap at the 150-node target', () => {
    for (const preset of graphPresets({ weighted: true })) {
      const params = preset.build(150, makeRng(1));
      expect((params.g ?? '').length, preset.id).toBeLessThanOrEqual(4000);
    }
  });

  it('lay every node out inside the box, with stable ids', () => {
    const params = graphPresets({ weighted: false })[0]?.build(30, makeRng(3));
    const parsed = parseEdgeList(params?.g ?? '');
    if (!parsed.ok) throw new Error(parsed.error);
    const graph = buildGraph(parsed.value, false, 'auto');
    expect(graph.nodes.map((node) => node.id)).toEqual(Array.from({ length: 30 }, (_, i) => String(i)));
    for (const node of graph.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(1);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(1);
    }
    expect(new Set(graph.edges.map((edge) => edge.id)).size).toBe(graph.edges.length);
  });
});
