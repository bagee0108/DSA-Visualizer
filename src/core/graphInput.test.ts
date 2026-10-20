import { describe, expect, it } from 'vitest';

import type { ParamMap, PresetSpec } from './define';
import {
  buildGraph,
  formatEdgeList,
  graphPresets,
  graphSizeOf,
  MAX_GRAPH_NODES,
  parseEdgeList,
  parseStart,
  PRESET_TRIES,
  presetViolations,
  regenerating,
  RING_MAX_NODES,
} from './graphInput';
import { layoutGraph } from './graphLayout';
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
  it('build parseable lists whose node count is the requested size, or the preset cap, at both ends of the range', () => {
    for (const weighted of [false, true]) {
      for (const preset of graphPresets({ weighted })) {
        for (const size of [4, 37, 150]) {
          const params = preset.build(size, makeRng(size));
          const parsed = parseEdgeList(params.g ?? '', { requireWeights: weighted });
          expect(parsed.ok, `${preset.id} @ ${size}`).toBe(true);
          if (!parsed.ok) continue;
          expect(parsed.value.nodeCount, `${preset.id} @ ${size} nodes`).toBe(Math.min(size, preset.maxSize ?? size));
          expect(parsed.value.weighted).toBe(weighted);
        }
      }
    }
  });

  it('cap only the ring, below the node cap, and say why', () => {
    const capped = graphPresets({ weighted: false }).filter((preset) => preset.maxSize !== undefined);
    expect(capped.map((preset) => preset.id)).toEqual(['ring']);
    expect(RING_MAX_NODES).toBeLessThan(MAX_GRAPH_NODES);
    expect(capped[0]?.maxSize).toBe(RING_MAX_NODES);
    expect(capped[0]?.capReason?.length ?? 0).toBeGreaterThan(0);
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

describe('preset regeneration', () => {
  // On a grid layout three nodes sit in one row, so 0-2 runs straight under node 1.
  const UNDER = 'g=0-2,1';
  const CLEAR = 'g=0-1,1-2';
  const through = (count: number): ParamMap => ({ g: Array.from({ length: count }, (_, i) => `${i * 3}-${i * 3 + 2},${i * 3 + 1}`).join(','), layout: 'grid' });

  /** A preset that builds the given graphs in turn, and counts its builds. */
  function scripted(graphs: readonly ParamMap[]): { preset: PresetSpec; builds: () => number } {
    let calls = 0;
    const preset: PresetSpec = {
      id: 'scripted',
      label: 'Scripted',
      build: () => {
        const params = graphs[Math.min(calls, graphs.length - 1)] ?? {};
        calls += 1;
        return params;
      },
    };
    return { preset, builds: () => calls };
  }

  const grid = (text: string): ParamMap => ({ g: text.slice(2), layout: 'grid' });

  it('counts an edge under a node, and nothing on a clear layout', () => {
    expect(presetViolations(grid(UNDER))).toBeGreaterThan(0);
    expect(presetViolations(grid(CLEAR))).toBe(0);
  });

  it('keeps the first graph, built once, when its layout is clear', () => {
    const { preset, builds } = scripted([grid(CLEAR), grid(UNDER)]);
    const [wrapped] = regenerating([preset]);
    expect(wrapped?.build(3, makeRng(1))).toEqual(grid(CLEAR));
    expect(builds()).toBe(1);
  });

  it('builds again until a layout is clear', () => {
    const { preset, builds } = scripted([grid(UNDER), grid(UNDER), grid(CLEAR)]);
    const [wrapped] = regenerating([preset]);
    expect(wrapped?.build(3, makeRng(1))).toEqual(grid(CLEAR));
    expect(builds()).toBe(3);
  });

  it('stops after PRESET_TRIES graphs and keeps the one with the fewest violations', () => {
    // A clear graph comes sixth, one past the limit, so it is never built.
    const attempts = [through(3), through(2), through(1), through(2), through(3), grid(CLEAR)];
    const counts = attempts.slice(0, PRESET_TRIES).map(presetViolations);
    expect(counts.every((count) => count > 0)).toBe(true);
    // Not the first graph, so this tests the choice, not just the fallback.
    expect(counts.indexOf(Math.min(...counts))).toBeGreaterThan(0);
    const fewest = attempts[counts.indexOf(Math.min(...counts))];
    const { preset, builds } = scripted(attempts);
    const [wrapped] = regenerating([preset]);
    expect(wrapped?.build(9, makeRng(1))).toEqual(fewest);
    expect(builds()).toBe(PRESET_TRIES);
  });

  it('leaves a preset that is already clear building the same graph from the same seed', () => {
    for (const preset of graphPresets({ weighted: true })) {
      for (const size of [6, 40]) {
        const first = preset.build(size, makeRng(size));
        expect(presetViolations(first), `${preset.id} @ ${size}`).toBe(0);
      }
    }
  });
});

describe('buildGraph layouts', () => {
  const positions = (text: string): [number, number][] => {
    const list = parseEdgeList(text);
    if (!list.ok) throw new Error(list.error);
    return buildGraph(list.value, false, 'auto').nodes.map((node) => [node.x, node.y]);
  };

  it('gives the layout layoutGraph computes, on a first build and on a repeat', () => {
    const text = '0-1,1-2,2-3,3-0,0-2,4-5,5-6';
    const direct = layoutGraph(7, [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [4, 5], [5, 6]], 'auto').map((p): [number, number] => [p.x, p.y]);
    expect(positions(text)).toEqual(direct);
    expect(positions(text)).toEqual(direct);
  });

  it('tells apart graphs with the same nodes and different edges', () => {
    const ring = positions('0-1,1-2,2-3,3-4,4-5,5-0');
    const star = positions('0-1,0-2,0-3,0-4,0-5');
    expect(star).not.toEqual(ring);
    expect(positions('0-1,1-2,2-3,3-4,4-5,5-0')).toEqual(ring);
  });
});
