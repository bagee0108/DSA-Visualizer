/** Test-only helpers for the graph family: reference algorithms over a plain adjacency list. */

import { parseEdgeList, type EdgeListEdge } from '../../core/graphInput';
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
