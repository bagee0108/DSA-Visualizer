/** Test-only helpers for the graph family: reference algorithms over a plain adjacency list. */

import { expect } from 'vitest';

import type { RegisteredAlgorithm } from '../../core/define';
import { buildGraph, parseDirected, parseEdgeList, parseLayout, type EdgeListEdge } from '../../core/graphInput';
import { makeRng } from '../../core/random';
import { clearanceOf, EDGE_CLEARANCE_VIEW, minNodeGap } from '../../renderers/graphClearance';
import { graphBandBottom, graphGeometry } from '../../renderers/GraphRenderer';
import type { Frame, Strip } from '../../core/types';
import { graphOf } from '../frameHygiene';

export interface Adjacency {
  readonly nodeCount: number;
  readonly out: readonly (readonly { readonly to: number; readonly weight: number }[])[];
  readonly edges: readonly EdgeListEdge[];
}

export function adjacencyOf(g: string, directed = false): Adjacency {
  const parsed = parseEdgeList(g, { directed });
  if (!parsed.ok) throw new Error(parsed.error);
  const out: { to: number; weight: number }[][] = Array.from({ length: parsed.value.nodeCount }, () => []);
  for (const edge of parsed.value.edges) {
    out[edge.from]?.push({ to: edge.to, weight: edge.weight ?? 1 });
    if (!directed) out[edge.to]?.push({ to: edge.from, weight: edge.weight ?? 1 });
  }
  for (const list of out) list.sort((a, b) => a.to - b.to);
  return { nodeCount: parsed.value.nodeCount, out, edges: parsed.value.edges };
}

export function referenceBfs(adj: Adjacency, start: number): number[] {
  const dist = Array.from({ length: adj.nodeCount }, () => Number.POSITIVE_INFINITY);
  dist[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head];
    if (u === undefined) break;
    for (const { to } of adj.out[u] ?? []) {
      if (dist[to] !== Number.POSITIVE_INFINITY) continue;
      dist[to] = (dist[u] ?? 0) + 1;
      queue.push(to);
    }
  }
  return dist;
}

export function referenceDijkstra(adj: Adjacency, start: number): number[] {
  const dist = Array.from({ length: adj.nodeCount }, () => Number.POSITIVE_INFINITY);
  const done = Array.from({ length: adj.nodeCount }, () => false);
  dist[start] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < adj.nodeCount; i++) {
      if (done[i] === true) continue;
      if (u === -1 || (dist[i] ?? 0) < (dist[u] ?? 0)) u = i;
    }
    if (u === -1 || dist[u] === Number.POSITIVE_INFINITY) break;
    done[u] = true;
    for (const { to, weight } of adj.out[u] ?? []) {
      const candidate = (dist[u] ?? 0) + weight;
      if (candidate < (dist[to] ?? 0)) dist[to] = candidate;
    }
  }
  return dist;
}

/** Discovery order and reachability of a recursive DFS that scans neighbours by ascending id. */
export function referenceDfs(adj: Adjacency, start: number, forest: boolean): number[] {
  const seen = Array.from({ length: adj.nodeCount }, () => false);
  const order: number[] = [];
  const go = (u: number): void => {
    seen[u] = true;
    order.push(u);
    for (const { to } of adj.out[u] ?? []) if (seen[to] !== true) go(to);
  };
  go(start);
  if (forest) for (let s = 0; s < adj.nodeCount; s++) if (seen[s] !== true) go(s);
  return order;
}

export function finalLabels(frames: readonly Frame[]): Readonly<Record<string, string>> {
  const last = frames[frames.length - 1];
  if (last === undefined) throw new Error('no frames');
  return graphOf(last).labels;
}

export function stripOf(frame: Frame, label: string): Strip {
  const strip = graphOf(frame).strips.find((candidate) => candidate.label === label);
  if (strip === undefined) throw new Error(`no strip ${label}`);
  return strip;
}

export function stripIds(frame: Frame, label: string): string[] {
  return stripOf(frame, label).items.map((item) => item.id);
}

export function reachedCount(dist: readonly number[]): number {
  return dist.filter((d) => Number.isFinite(d)).length;
}

export function sumDegrees(adj: Adjacency, nodes: readonly number[]): number {
  return nodes.reduce((sum, u) => sum + (adj.out[u]?.length ?? 0), 0);
}

/** 53-bit string hash (cyrb53): a fingerprint, not a defence. */
export function hash53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * A run's frames as one fingerprint: every field of every frame, in order. The
 * graph is shared by every frame of a run, so it is hashed once, not per frame,
 * and only its topology: where the layout puts nodes is not part of a run.
 */
export function fingerprint(frames: readonly Frame[]): string {
  const first = frames[0];
  const graph = first === undefined ? null : graphOf(first).graph;
  const topology =
    graph === null
      ? null
      : { directed: graph.directed, weighted: graph.weighted, nodes: graph.nodes.map((node) => [node.id, node.label]), edges: graph.edges };
  const body = JSON.stringify(frames, (key, value: unknown) => (key === 'graph' ? undefined : value));
  return `${frames.length}:${hash53(JSON.stringify(topology))}:${hash53(body)}`;
}

/** Seeds every clearance sweep uses, fixed so the sweep is deterministic. */
export const SWEEP_SEEDS: readonly number[] = Array.from({ length: 20 }, (_, i) => i + 1);
export const SWEEP_SIZES = [6, 12, 40, 150] as const;

export interface SweepRow {
  readonly level: string;
  readonly preset: string;
  readonly size: number;
  /** Seeds, of SWEEP_SEEDS, whose layout has an edge too close to a node it does not join. */
  readonly failing: number;
  readonly worstPairs: number;
  /** Seeds whose force-directed layout puts two nodes closer than a diameter plus the clearance. */
  readonly crowded: number;
}

/**
 * Lays out every preset of a level at every sweep size and seed, the way the
 * level would (same parser, same buildGraph, same strip band), and counts
 * clearance failures. Only the layout is built, not the run, so it stays fast.
 */
export function clearanceSweep(level: RegisteredAlgorithm): SweepRow[] {
  const sample = level.build(level.defaults);
  if (!sample.ok) throw new Error(sample.error);
  const bottom = graphBandBottom(graphOf(sample.frames[0]).strips.length);
  const rows: SweepRow[] = [];
  for (const preset of level.presets) {
    for (const size of SWEEP_SIZES) {
      let failing = 0;
      let worstPairs = 0;
      let crowded = 0;
      for (const seed of SWEEP_SEEDS) {
        const params = { ...level.defaults, ...preset.build(size, makeRng(seed * 7919 + size)) };
        const directed = parseDirected(params.directed);
        const list = parseEdgeList(params.g ?? '', { directed });
        if (!list.ok) throw new Error(`${level.meta.id}/${preset.id}@${size}#${seed}: ${list.error}`);
        const layout = parseLayout(params.layout);
        const geometry = graphGeometry(buildGraph(list.value, directed, layout), bottom);
        const { pairs } = clearanceOf(geometry);
        if (pairs > 0) failing += 1;
        worstPairs = Math.max(worstPairs, pairs);
        if (layout === 'auto' && minNodeGap(geometry) < 2 * geometry.radius + EDGE_CLEARANCE_VIEW) crowded += 1;
      }
      rows.push({ level: level.meta.id, preset: preset.id, size, failing, worstPairs, crowded });
    }
  }
  return rows;
}

/** Asserts a level's sweep is clean: no seed leaves an edge too close to a node, or crowds nodes together. CLEARANCE_REPORT=1 prints the table. */
export function expectCleanSweep(level: RegisteredAlgorithm): void {
  const rows = clearanceSweep(level);
  if (import.meta.env.CLEARANCE_REPORT !== undefined) {
    console.log(rows.map((row) => `SWEEPROW ${row.level} ${row.preset} ${row.size} ${row.failing} ${row.worstPairs} ${row.crowded}`).join('\n'));
  }
  expect(rows.filter((row) => row.failing > 0 || row.crowded > 0)).toEqual([]);
}
