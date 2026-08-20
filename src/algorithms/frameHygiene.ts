/** Shared assertions for the invariants the player and renderers depend on. */

import { expect } from 'vitest';

import type { ParamMap, RegisteredAlgorithm } from '../core/define';
import type { ArraySnapshot, Frame, Graph, GraphSnapshot, TreeSnapshot } from '../core/types';

export function runFrames(algorithm: RegisteredAlgorithm, params: ParamMap): readonly Frame[] {
  const result = algorithm.build(params);
  if (!result.ok) throw new Error(`${algorithm.meta.id} build failed: ${result.error}`);
  return result.frames;
}

export function lastFrame(frames: readonly Frame[]): Frame {
  const frame = frames[frames.length - 1];
  if (frame === undefined) throw new Error('no frames');
  return frame;
}

export function arrayOf(frame: Frame | undefined): ArraySnapshot {
  if (frame === undefined) throw new Error('no frame');
  if (frame.structure.kind !== 'array') throw new Error(`expected an array frame, got ${frame.structure.kind}`);
  return frame.structure;
}

export function treeOf(frame: Frame | undefined): TreeSnapshot {
  if (frame === undefined) throw new Error('no frame');
  if (frame.structure.kind !== 'tree') throw new Error(`expected a tree frame, got ${frame.structure.kind}`);
  return frame.structure;
}

export function graphOf(frame: Frame | undefined): GraphSnapshot {
  if (frame === undefined) throw new Error('no frame');
  if (frame.structure.kind !== 'graph') throw new Error(`expected a graph frame, got ${frame.structure.kind}`);
  return frame.structure;
}

export function valuesOf(frame: Frame): number[] {
  return arrayOf(frame).elements.map((element) => element.value);
}

export function idsOf(frame: Frame): number[] {
  return arrayOf(frame).elements.map((element) => element.id);
}

export function indexPointer(frame: Frame, name: string): number | undefined {
  const value = frame.pointers[name];
  return typeof value === 'number' ? value : undefined;
}

export interface HygieneOptions {
  readonly allowNonEmptyFinalStack?: boolean;
  readonly allowSizeChange?: boolean;
  /** Recursion bound; a DFS legitimately goes as deep as the node count. */
  readonly maxStackDepth?: number;
}

export function expectFrameHygiene(
  algorithm: RegisteredAlgorithm,
  frames: readonly Frame[],
  options: HygieneOptions = {},
): void {
  expect(frames.length).toBeGreaterThan(0);
  const codeLineCount = algorithm.codeLines.length;

  let previous: Frame | null = null;
  let topology: Graph | null = null;
  for (const [position, frame] of frames.entries()) {
    const where = `${algorithm.meta.id} frame ${position}`;

    expect(frame.codeLine, `${where}: codeLine`).toBeGreaterThanOrEqual(0);
    expect(frame.codeLine, `${where}: codeLine`).toBeLessThanOrEqual(codeLineCount);

    expect(frame.explanation.trim().length, `${where}: explanation`).toBeGreaterThan(0);

    expect(frame.callStack.length, `${where}: stack depth`).toBeLessThan(options.maxStackDepth ?? 64);

    if (previous !== null) {
      for (const key of ['comparisons', 'swaps', 'reads', 'writes', 'recursiveCalls'] as const) {
        expect(frame.counters[key], `${where}: ${key}`).toBeGreaterThanOrEqual(previous.counters[key]);
      }
    }

    if (frame.structure.kind === 'array') {
      expectArrayFrame(frame.structure, frame, where, previous, options);
    } else if (frame.structure.kind === 'tree') {
      expectTreeFrame(frame.structure, frame, where);
    } else {
      if (topology === null) {
        topology = frame.structure.graph;
        expectWellFormedGraph(topology, where);
      }
      expectGraphFrame(frame.structure, frame, where, topology);
    }
    previous = frame;
  }

  if (options.allowNonEmptyFinalStack !== true) {
    expect(lastFrame(frames).callStack, `${algorithm.meta.id}: final stack`).toHaveLength(0);
  }
}

function expectArrayFrame(
  structure: ArraySnapshot,
  frame: Frame,
  where: string,
  previous: Frame | null,
  options: HygieneOptions,
): void {
  const size = structure.elements.length;

  if (previous !== null && previous.structure.kind === 'array' && options.allowSizeChange !== true) {
    expect(size, `${where}: size`).toBe(previous.structure.elements.length);
  }

  // Snapshots are frozen, so a renderer cannot corrupt playback.
  expect(Object.isFrozen(structure.elements), `${where}: frozen`).toBe(true);

  for (const [label, index] of Object.entries(frame.pointers)) {
    expect(typeof index, `${where}: pointer ${label} must be an index`).toBe('number');
    if (typeof index !== 'number') continue;
    expect(index, `${where}: pointer ${label}`).toBeGreaterThanOrEqual(-1);
    expect(index, `${where}: pointer ${label}`).toBeLessThanOrEqual(size);
  }

  for (const [role, ids] of Object.entries(frame.highlights)) {
    for (const id of ids ?? []) {
      if (typeof id === 'number') {
        expect(id, `${where}: highlight ${role}`).toBeGreaterThanOrEqual(0);
        expect(id, `${where}: highlight ${role}`).toBeLessThan(size);
      } else {
        const match = /^aux:(\d+)$/.exec(id);
        expect(match, `${where}: highlight ${role} id "${id}"`).not.toBeNull();
        expect(Number(match?.[1] ?? -1), `${where}: aux highlight`).toBeLessThan(size);
      }
    }
  }

  for (const region of structure.regions) {
    expect(region.from, `${where}: region ${region.label}`).toBeGreaterThanOrEqual(0);
    expect(region.to, `${where}: region ${region.label}`).toBeLessThan(size);
    expect(region.from, `${where}: region ${region.label}`).toBeLessThanOrEqual(region.to);
  }

  const aux = structure.auxiliary;
  if (aux !== undefined) {
    expect(aux.activeFrom, `${where}: aux from`).toBeGreaterThanOrEqual(0);
    expect(aux.activeTo, `${where}: aux to`).toBeLessThan(size);
    expect(aux.elements.length, `${where}: aux size`).toBe(size);
  }

  const heap = structure.heap;
  if (heap !== undefined) {
    expect(heap.size, `${where}: heap size`).toBeGreaterThanOrEqual(0);
    expect(heap.size, `${where}: heap size`).toBeLessThanOrEqual(size);
  }
}

function expectTreeFrame(structure: TreeSnapshot, frame: Frame, where: string): void {
  expect(Object.isFrozen(structure.nodes), `${where}: frozen`).toBe(true);

  const ids = new Set(structure.nodes.map((node) => node.id));
  expect(ids.size, `${where}: duplicate node ids`).toBe(structure.nodes.length);
  const byId = new Map(structure.nodes.map((node) => [node.id, node] as const));

  if (structure.rootId !== null) {
    expect(ids.has(structure.rootId), `${where}: root ${structure.rootId} exists`).toBe(true);
    expect(byId.get(structure.rootId)?.parentId, `${where}: root has no parent`).toBeNull();
  }

  for (const node of structure.nodes) {
    if (structure.arity === 'binary') {
      expect(node.children.length, `${where}: node ${node.id} slots`).toBe(2);
    }
    for (const child of node.children) {
      if (child === null) continue;
      expect(ids.has(child), `${where}: child ${child} of ${node.id} exists`).toBe(true);
      expect(byId.get(child)?.parentId, `${where}: child ${child} points back to ${node.id}`).toBe(node.id);
    }
    if (node.parentId !== null) {
      expect(ids.has(node.parentId), `${where}: parent ${node.parentId} of ${node.id} exists`).toBe(true);
      expect(
        byId.get(node.parentId)?.children.includes(node.id),
        `${where}: parent ${node.parentId} lists ${node.id}`,
      ).toBe(true);
    }
  }

  if (structure.rootId !== null) {
    const seen = new Set<string>();
    const stack = [structure.rootId];
    while (stack.length > 0) {
      const id = stack.pop();
      if (id === undefined) break;
      expect(seen.has(id), `${where}: cycle through ${id}`).toBe(false);
      seen.add(id);
      for (const child of byId.get(id)?.children ?? []) if (child !== null) stack.push(child);
    }
    expect(seen.size, `${where}: every node reachable from the root`).toBe(structure.nodes.length);
  }

  for (const [label, target] of Object.entries(frame.pointers)) {
    expect(typeof target, `${where}: pointer ${label} must be a node id`).toBe('string');
    if (typeof target === 'string') expect(ids.has(target), `${where}: pointer ${label} -> ${target}`).toBe(true);
  }
  for (const [role, targets] of Object.entries(frame.highlights)) {
    for (const target of targets ?? []) {
      expect(typeof target, `${where}: highlight ${role} must be a string`).toBe('string');
      if (typeof target !== 'string') continue;
      const stripped = target.replace(/^(queue|stack|output):/, '');
      expect(ids.has(stripped) || target !== stripped, `${where}: highlight ${role} -> ${target}`).toBe(true);
    }
  }

  for (const strip of structure.strips) {
    expect(strip.label.length, `${where}: strip label`).toBeGreaterThan(0);
    const chipIds = new Set(strip.items.map((item) => item.id));
    expect(chipIds.size, `${where}: strip ${strip.label} duplicate chips`).toBe(strip.items.length);
  }
}

function expectWellFormedGraph(graph: Graph, where: string): void {
  const ids = new Set(graph.nodes.map((node) => node.id));
  expect(ids.size, `${where}: duplicate node ids`).toBe(graph.nodes.length);
  for (const node of graph.nodes) {
    expect(node.x, `${where}: node ${node.id} x`).toBeGreaterThanOrEqual(0);
    expect(node.x, `${where}: node ${node.id} x`).toBeLessThanOrEqual(1);
    expect(node.y, `${where}: node ${node.id} y`).toBeGreaterThanOrEqual(0);
    expect(node.y, `${where}: node ${node.id} y`).toBeLessThanOrEqual(1);
  }
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));
  expect(edgeIds.size, `${where}: duplicate edge ids`).toBe(graph.edges.length);
  for (const edge of graph.edges) {
    expect(ids.has(edge.from), `${where}: edge ${edge.id} from`).toBe(true);
    expect(ids.has(edge.to), `${where}: edge ${edge.id} to`).toBe(true);
    if (graph.weighted) expect(Number.isFinite(edge.weight), `${where}: edge ${edge.id} weight`).toBe(true);
  }
}

function expectGraphFrame(structure: GraphSnapshot, frame: Frame, where: string, topology: Graph): void {
  // Topology is shared by reference: the same object in every frame, never a copy.
  expect(structure.graph, `${where}: topology identity`).toBe(topology);
  expect(Object.isFrozen(structure.visited), `${where}: visited frozen`).toBe(true);
  expect(Object.isFrozen(structure.treeEdges), `${where}: treeEdges frozen`).toBe(true);
  expect(Object.isFrozen(structure.labels), `${where}: labels frozen`).toBe(true);

  const nodeIds = new Set(topology.nodes.map((node) => node.id));
  const edgeIds = new Set(topology.edges.map((edge) => edge.id));

  expect(new Set(structure.visited).size, `${where}: visited duplicates`).toBe(structure.visited.length);
  for (const id of structure.visited) expect(nodeIds.has(id), `${where}: visited ${id}`).toBe(true);
  expect(new Set(structure.treeEdges).size, `${where}: treeEdges duplicates`).toBe(structure.treeEdges.length);
  for (const id of structure.treeEdges) expect(edgeIds.has(id), `${where}: tree edge ${id}`).toBe(true);
  for (const id of Object.keys(structure.labels)) expect(nodeIds.has(id), `${where}: label on ${id}`).toBe(true);

  for (const [label, target] of Object.entries(frame.pointers)) {
    expect(typeof target, `${where}: pointer ${label} must be a node id`).toBe('string');
    if (typeof target === 'string') expect(nodeIds.has(target), `${where}: pointer ${label} -> ${target}`).toBe(true);
  }
  for (const [role, targets] of Object.entries(frame.highlights)) {
    for (const target of targets ?? []) {
      expect(typeof target, `${where}: highlight ${role} must be a string`).toBe('string');
      if (typeof target !== 'string') continue;
      const edge = /^edge:(.+)$/.exec(target);
      const chip = /^(queue|stack|pq|output):/.test(target);
      const ok = edge !== null ? edgeIds.has(edge[1] ?? '') : chip || nodeIds.has(target);
      expect(ok, `${where}: highlight ${role} -> ${target}`).toBe(true);
    }
  }

  for (const strip of structure.strips) {
    expect(strip.label.length, `${where}: strip label`).toBeGreaterThan(0);
    const chipIds = new Set(strip.items.map((item) => item.id));
    expect(chipIds.size, `${where}: strip ${strip.label} duplicate chips`).toBe(strip.items.length);
  }
}

export function expectDeterministic(algorithm: RegisteredAlgorithm, params: ParamMap): void {
  const a = runFrames(algorithm, params);
  const b = runFrames(algorithm, params);
  expect(a.length).toBe(b.length);
  expect(a.map((frame) => JSON.stringify(frame.structure))).toEqual(b.map((frame) => JSON.stringify(frame.structure)));
  expect(a.map((frame) => frame.explanation)).toEqual(b.map((frame) => frame.explanation));
  expect(a.map((frame) => frame.codeLine)).toEqual(b.map((frame) => frame.codeLine));
}

export function expectInputContract(algorithm: RegisteredAlgorithm): void {
  for (const field of algorithm.fields) {
    expect(algorithm.defaults[field.key], `${algorithm.meta.id}: default ${field.key}`).toBe(
      field.defaultValue,
    );
    if (field.kind === 'select') {
      const options = field.options ?? [];
      expect(options.length, `${algorithm.meta.id}: ${field.key} options`).toBeGreaterThan(0);
      expect(options.some((option) => option.value === field.defaultValue)).toBe(true);
    }
  }
  expect(algorithm.build({}).ok, `${algorithm.meta.id}: defaults must run`).toBe(true);
}
