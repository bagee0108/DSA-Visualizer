/**
 * Layout invariant: no edge, as drawn, passes within a node radius plus 2 view
 * units of a node that is not one of its endpoints. An edge under a third node
 * reads as two edges through it. Checked on every preset of every graph level.
 */

import { describe, expect, it } from 'vitest';

import type { RegisteredAlgorithm } from '../../core/define';
import { buildGraph, parseEdgeList } from '../../core/graphInput';
import { layoutViolations, type EdgePair } from '../../core/graphLayout';
import { makeRng, randomInt } from '../../core/random';
import { clearanceOf, EDGE_CLEARANCE_VIEW, minNodeGap } from '../../renderers/graphClearance';
import { graphBandBottom, graphGeometry } from '../../renderers/GraphRenderer';
import { graphOf } from '../frameHygiene';
import { bfs } from './bfs';
import { dfs } from './dfs';
import { dijkstra } from './dijkstra';
import { tarjanScc } from './tarjan';
import { topologicalSort } from './topoSort';
import { bellmanFord } from './bellmanFord';
import { kruskal } from './kruskal';
import { unionFind } from './unionFind';

const LEVELS: readonly RegisteredAlgorithm[] = [bfs, dfs, dijkstra, unionFind, tarjanScc, topologicalSort, bellmanFord, kruskal];
const SIZES = [6, 12, 40, 150] as const;

interface ClearanceCase {
  readonly level: string;
  readonly preset: string;
  readonly size: number;
  readonly layout: string;
  /** Edge/node pairs closer than radius + EDGE_CLEARANCE_VIEW. */
  readonly violations: number;
  /** Closest two node centres, in view units, against a diameter plus EDGE_CLEARANCE_VIEW. */
  readonly minGap: number;
  readonly needGap: number;
}

function clearanceCases(): ClearanceCase[] {
  const out: ClearanceCase[] = [];
  for (const level of LEVELS) {
    for (const preset of level.presets) {
      for (const size of SIZES) {
        const params = preset.build(size, makeRng(size * 101 + 7));
        const built = level.build(params);
        if (!built.ok) throw new Error(`${level.meta.id}/${preset.id}@${size}: ${built.error}`);
        const first = graphOf(built.frames[0]);
        const geometry = graphGeometry(first.graph, graphBandBottom(first.strips.length));
        const violations = clearanceOf(geometry).pairs;
        const minGap = minNodeGap(geometry);
        out.push({ level: level.meta.id, preset: preset.id, size, layout: params.layout ?? 'auto', violations, minGap, needGap: 2 * geometry.radius + EDGE_CLEARANCE_VIEW });
      }
    }
  }
  return out;
}

describe('graph layout: edge clearance', () => {
  // Was 41 of 100 cases and 2488 edge/node pairs on the clamped layout (08c298d).
  // CLEARANCE_REPORT=1 prints the per-case table.
  let cached: ClearanceCase[] | null = null;
  const rows = (): ClearanceCase[] => (cached ??= clearanceCases());

  it('keeps every edge clear of every node it does not join, on every preset of every graph level', () => {
    if (import.meta.env.CLEARANCE_REPORT !== undefined) {
      console.log(['level preset size violations minGap', ...rows().map((row) => `${row.level} ${row.preset} ${row.size} ${row.violations} ${row.minGap.toFixed(2)}`)].join('\n'));
    }
    const failing = rows().filter((row) => row.violations > 0);
    expect(failing).toEqual([]);
  }, 120000);

  it('keeps nodes a diameter plus the clearance apart in every layout, so none hides another', () => {
    // Ring presets are capped (RING_MAX_NODES) so a ring can hold this spacing too.
    const crowded = rows().filter((row) => row.minGap < row.needGap);
    expect(crowded).toEqual([]);
  }, 120000);
});

describe('layoutViolations, the check presets regenerate on', () => {
  /** Too many edges for the box, so most layouts break clearance; directed ones with two-way pairs. */
  function crowdedGraph(nodes: number, edges: number, directed: boolean, seed: number): string {
    const rng = makeRng(seed);
    const out: string[] = [];
    for (let i = 0; i < edges; i++) {
      const a = randomInt(rng, 0, nodes - 1);
      const b = randomInt(rng, 0, nodes - 1);
      if (a === b) continue;
      out.push(`${a}-${b}`);
      if (directed && i % 4 === 0) out.push(`${b}-${a}`);
    }
    return out.join(',');
  }

  it('is never more lenient than the renderer: whatever the canvas measures as too close, it counts', () => {
    let rendererCaught = 0;
    for (const directed of [false, true]) {
      for (const nodes of [12, 40, 150]) {
        for (let seed = 1; seed <= 6; seed++) {
          const list = parseEdgeList(crowdedGraph(nodes, nodes * 3, directed, seed * 31 + nodes), { directed });
          if (!list.ok) throw new Error(list.error);
          const graph = buildGraph(list.value, directed, 'auto');
          const pairs: EdgePair[] = list.value.edges.map((edge) => [edge.from, edge.to]);
          const counted = layoutViolations(graph.nodes, pairs);
          // One and two strip rows: the two band heights graph levels draw in.
          for (const strips of [1, 2]) {
            const geometry = graphGeometry(graph, graphBandBottom(strips));
            const bad = clearanceOf(geometry).pairs > 0 || minNodeGap(geometry) < 2 * geometry.radius + EDGE_CLEARANCE_VIEW;
            if (bad) rendererCaught += 1;
            if (bad) expect(counted, `${directed ? 'directed' : 'undirected'} ${nodes}#${seed}, ${strips} strips`).toBeGreaterThan(0);
          }
        }
      }
    }
    // The graphs are crowded enough that the comparison means something.
    expect(rendererCaught).toBeGreaterThan(20);
  }, 120000);
});
