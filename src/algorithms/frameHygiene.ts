/** Shared assertions for the invariants the player and renderers depend on. */

import { expect } from 'vitest';

import type { ParamMap, RegisteredAlgorithm } from '../core/define';
import { parseMatrixRef } from '../core/matrixScene';
import { parsePaneRef } from '../core/splitScene';
import type { ArraySnapshot, EntityId, Frame, Graph, GraphSnapshot, GridSnapshot, MatrixSnapshot, SplitSnapshot, TreeSnapshot } from '../core/types';

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

export function matrixOf(frame: Frame | undefined): MatrixSnapshot {
  if (frame === undefined) throw new Error('no frame');
  if (frame.structure.kind !== 'matrix') throw new Error(`expected a matrix frame, got ${frame.structure.kind}`);
  return frame.structure;
}

export function gridOf(frame: Frame | undefined): GridSnapshot {
  if (frame === undefined) throw new Error('no frame');
  if (frame.structure.kind !== 'grid') throw new Error(`expected a grid frame, got ${frame.structure.kind}`);
  return frame.structure;
}

export function splitOf(frame: Frame | undefined): SplitSnapshot {
  if (frame === undefined) throw new Error('no frame');
  if (frame.structure.kind !== 'split') throw new Error(`expected a split frame, got ${frame.structure.kind}`);
  return frame.structure;
}

/** One pane's table out of a split frame. */
export function paneOf(frame: Frame | undefined, pane: string): MatrixSnapshot {
  const found = splitOf(frame).panes.find((candidate) => candidate.id === pane);
  if (found === undefined) throw new Error(`no pane "${pane}"`);
  return found.view;
}

/** A numeric array's values; throws on letters, so a test cannot quietly compare the wrong kind. */
export function valuesOf(frame: Frame): number[] {
  return arrayOf(frame).elements.map(({ value }) => {
    if (typeof value !== 'number') throw new Error(`expected numbers, found "${value}"`);
    return value;
  });
}

/** A letter array's values; throws on numbers. */
export function lettersOf(frame: Frame): string[] {
  return arrayOf(frame).elements.map(({ value }) => {
    if (typeof value !== 'string') throw new Error(`expected letters, found ${value}`);
    return value;
  });
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
    } else if (frame.structure.kind === 'matrix') {
      expectMatrixFrame(frame.structure, frame, where, previous);
    } else if (frame.structure.kind === 'split') {
      expectSplitFrame(frame.structure, frame, where, previous);
    } else if (frame.structure.kind === 'grid') {
      expectGridFrame(frame.structure, frame, where, previous);
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

/** The longest string an array tile is drawn to hold. */
export const MAX_LETTER_LENGTH = 3;

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

  // One kind per array: bars and tiles do not mix, and a tile holds a short label.
  const kind = typeof structure.elements[0]?.value;
  const wellKept = (value: unknown): boolean =>
    typeof value === kind &&
    (typeof value === 'number' ? Number.isFinite(value) : typeof value === 'string' && value.length >= 1 && value.length <= MAX_LETTER_LENGTH);
  expect(firstBad(structure.elements.map((element) => element.value), wellKept), `${where}: element value`).toBeNull();
  // A note is a corner caption on a tile, so only letters carry one, and it is as short as a tile label.
  const noteKept = (element: ArraySnapshot['elements'][number]): boolean =>
    element.note === undefined ||
    (typeof element.value === 'string' && element.note.length >= 1 && element.note.length <= MAX_LETTER_LENGTH);
  expect(firstBad(structure.elements, noteKept), `${where}: element note`).toBeNull();

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
    const shown = aux.elements.slice(aux.activeFrom, aux.activeTo + 1).map((element) => element.value);
    expect(firstBad(shown, wellKept), `${where}: aux value of another kind`).toBeNull();
    expect(firstBad(aux.elements.slice(aux.activeFrom, aux.activeTo + 1), noteKept), `${where}: aux note`).toBeNull();
  }

  const heap = structure.heap;
  if (heap !== undefined) {
    expect(heap.size, `${where}: heap size`).toBeGreaterThanOrEqual(0);
    expect(heap.size, `${where}: heap size`).toBeLessThanOrEqual(size);
  }
}

function expectTreeFrame(structure: TreeSnapshot, frame: Frame, where: string): void {
  expectTreeShape(structure, where);
  const ids = new Set(structure.nodes.map((node) => node.id));
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
}

/** Node arrays already checked. Frames that do not change a tree share its frozen array, so each shape is checked once. */
const checkedTrees = new WeakSet<TreeSnapshot['nodes']>();

/** A tree on its own terms: frozen, consistent links both ways, one root, no cycles. */
function expectTreeShape(structure: TreeSnapshot, where: string): void {
  expect(Object.isFrozen(structure.nodes), `${where}: frozen`).toBe(true);
  expectStrips(structure.strips, where);
  if (checkedTrees.has(structure.nodes)) return;
  checkedTrees.add(structure.nodes);

  const ids = new Set(structure.nodes.map((node) => node.id));
  expect(ids.size, `${where}: duplicate node ids`).toBe(structure.nodes.length);
  const byId = new Map(structure.nodes.map((node) => [node.id, node] as const));

  if (structure.rootId !== null) {
    expect(ids.has(structure.rootId), `${where}: root ${structure.rootId} exists`).toBe(true);
    expect(byId.get(structure.rootId)?.parentId, `${where}: root has no parent`).toBeNull();
  }

  // Problems are collected in plain code and asserted once: a per-node expect is what made big searches slow.
  const problems: string[] = [];
  for (const node of structure.nodes) {
    if (structure.arity === 'binary' && node.children.length !== 2) problems.push(`node ${node.id} has ${node.children.length} slots`);
    for (const child of node.children) {
      if (child === null) continue;
      if (!ids.has(child)) problems.push(`child ${child} of ${node.id} does not exist`);
      else if (byId.get(child)?.parentId !== node.id) problems.push(`child ${child} does not point back to ${node.id}`);
    }
    if (node.parentId !== null) {
      if (!ids.has(node.parentId)) problems.push(`parent ${node.parentId} of ${node.id} does not exist`);
      else if (byId.get(node.parentId)?.children.includes(node.id) !== true) problems.push(`parent ${node.parentId} does not list ${node.id}`);
    }
  }

  if (structure.rootId !== null) {
    const seen = new Set<string>();
    const stack = [structure.rootId];
    while (stack.length > 0) {
      const id = stack.pop();
      if (id === undefined) break;
      if (seen.has(id)) {
        problems.push(`cycle through ${id}`);
        break;
      }
      seen.add(id);
      for (const child of byId.get(id)?.children ?? []) if (child !== null) stack.push(child);
    }
    if (seen.size !== structure.nodes.length) problems.push(`${structure.nodes.length - seen.size} nodes unreachable from the root`);
  }
  expect(problems, `${where}: tree shape`).toEqual([]);
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

interface GraphIds {
  readonly nodes: ReadonlySet<string>;
  readonly edges: ReadonlySet<string>;
}

/** Id sets depend only on the topology, which every frame shares, so build them once. */
const graphIdCache = new WeakMap<Graph, GraphIds>();

function graphIdsOf(topology: Graph): GraphIds {
  let ids = graphIdCache.get(topology);
  if (ids === undefined) {
    ids = { nodes: new Set(topology.nodes.map((node) => node.id)), edges: new Set(topology.edges.map((edge) => edge.id)) };
    graphIdCache.set(topology, ids);
  }
  return ids;
}

/** First offending item in a list, or null. A single expect per list keeps big runs fast. */
function firstBad<T>(items: readonly T[], ok: (item: T) => boolean): T | null {
  for (const item of items) if (!ok(item)) return item;
  return null;
}

function expectGraphFrame(structure: GraphSnapshot, frame: Frame, where: string, topology: Graph): void {
  // Topology is shared by reference: the same object in every frame, never a copy.
  expect(structure.graph, `${where}: topology identity`).toBe(topology);
  expect(Object.isFrozen(structure.visited), `${where}: visited frozen`).toBe(true);
  expect(Object.isFrozen(structure.treeEdges), `${where}: treeEdges frozen`).toBe(true);
  expect(Object.isFrozen(structure.labels), `${where}: labels frozen`).toBe(true);
  expect(Object.isFrozen(structure.links), `${where}: links frozen`).toBe(true);

  const ids = graphIdsOf(topology);
  const nodeIds = ids.nodes;
  const edgeIds = ids.edges;

  expect(new Set(structure.visited).size, `${where}: visited duplicates`).toBe(structure.visited.length);
  expect(firstBad(structure.visited, (id) => nodeIds.has(id)), `${where}: visited unknown node`).toBeNull();
  expect(new Set(structure.treeEdges).size, `${where}: treeEdges duplicates`).toBe(structure.treeEdges.length);
  expect(firstBad(structure.treeEdges, (id) => edgeIds.has(id)), `${where}: unknown tree edge`).toBeNull();
  expect(firstBad(Object.keys(structure.labels), (id) => nodeIds.has(id)), `${where}: label on unknown node`).toBeNull();
  expect(new Set(structure.links.map((link) => link.from)).size, `${where}: one link per node`).toBe(structure.links.length);
  expect(firstBad(structure.links, (link) => nodeIds.has(link.from) && nodeIds.has(link.to)), `${where}: link off the graph`).toBeNull();

  expect(
    firstBad(Object.entries(frame.pointers), ([, target]) => typeof target === 'string' && nodeIds.has(target)),
    `${where}: pointer to unknown node`,
  ).toBeNull();

  const validTarget = (target: EntityId): boolean => {
    if (typeof target !== 'string') return false;
    const edge = /^edge:(.+)$/.exec(target);
    if (edge !== null) return edgeIds.has(edge[1] ?? '');
    const link = /^link:(.+)$/.exec(target);
    if (link !== null) return nodeIds.has(link[1] ?? '');
    return /^(queue|stack|pq|output):/.test(target) || nodeIds.has(target);
  };
  for (const [role, targets] of Object.entries(frame.highlights)) {
    expect(firstBad(targets ?? [], validTarget), `${where}: highlight ${role} off the graph`).toBeNull();
  }

  for (const strip of structure.strips) {
    expect(strip.label.length, `${where}: strip label`).toBeGreaterThan(0);
    expect(new Set(strip.items.map((item) => item.id)).size, `${where}: strip ${strip.label} duplicate chips`).toBe(strip.items.length);
  }
}

/** The table on its own: fixed shape, frozen, every arrow and path cell on it. */
function expectMatrixTable(structure: MatrixSnapshot, where: string, previous: MatrixSnapshot | null): void {
  const { rows, cols } = structure;
  expect(rows, `${where}: rows`).toBeGreaterThan(0);
  expect(cols, `${where}: cols`).toBeGreaterThan(0);
  if (previous !== null) {
    expect([rows, cols], `${where}: shape is fixed for the run`).toEqual([previous.rows, previous.cols]);
    expect(structure.arrowsUnder, `${where}: arrowsUnder is fixed for the run`).toBe(previous.arrowsUnder);
  }

  expect(Object.isFrozen(structure.cells), `${where}: cells frozen`).toBe(true);
  expect(Object.isFrozen(structure.arrows), `${where}: arrows frozen`).toBe(true);
  expect(Object.isFrozen(structure.path), `${where}: path frozen`).toBe(true);
  expect(structure.cells.length, `${where}: cell count`).toBe(rows * cols);
  expect(structure.rowHeaders.length, `${where}: row headers`).toBe(rows);
  expect(structure.colHeaders.length, `${where}: column headers`).toBe(cols);
  expect(firstBad(structure.cells, (value) => value === null || Number.isFinite(value)), `${where}: cell value`).toBeNull();

  const inside = (cell: { readonly row: number; readonly col: number }): boolean => insideTable(structure, cell);
  expect(firstBad(structure.arrows, (arrow) => inside(arrow.from) && inside(arrow.to)), `${where}: arrow off the table`).toBeNull();
  expect(firstBad(structure.path, inside), `${where}: path off the table`).toBeNull();
  expect(new Set(structure.path.map((cell) => `${cell.row}:${cell.col}`)).size, `${where}: path revisits a cell`).toBe(structure.path.length);
}

function insideTable(structure: MatrixSnapshot, cell: { readonly row: number; readonly col: number }): boolean {
  return (
    Number.isInteger(cell.row) &&
    Number.isInteger(cell.col) &&
    cell.row >= 0 &&
    cell.col >= 0 &&
    cell.row < structure.rows &&
    cell.col < structure.cols
  );
}

function onTable(structure: MatrixSnapshot, target: string): boolean {
  const ref = parseMatrixRef(target);
  if (ref === null) return false;
  if (ref.kind === 'cell') return insideTable(structure, ref);
  return ref.index < (ref.kind === 'row' ? structure.rows : structure.cols);
}

const STRIP_REF = /^(queue|stack|pq|output):/;

function expectStrips(strips: SplitSnapshot['strips'], where: string): void {
  for (const strip of strips) {
    expect(strip.label.length, `${where}: strip label`).toBeGreaterThan(0);
    expect(new Set(strip.items.map((item) => item.id)).size, `${where}: strip ${strip.label} duplicate chips`).toBe(strip.items.length);
  }
}

/** Pointers and highlights all resolve, via `resolve`, to a place that exists. */
function expectRefs(frame: Frame, where: string, resolve: (target: string) => boolean): void {
  expect(
    firstBad(Object.entries(frame.pointers), ([, target]) => typeof target === 'string' && resolve(target)),
    `${where}: pointer off the table`,
  ).toBeNull();
  for (const [role, targets] of Object.entries(frame.highlights)) {
    expect(
      firstBad(targets ?? [], (target) => typeof target === 'string' && (resolve(target) || STRIP_REF.test(target))),
      `${where}: highlight ${role} off the table`,
    ).toBeNull();
  }
}

function expectMatrixFrame(structure: MatrixSnapshot, frame: Frame, where: string, previous: Frame | null): void {
  expectMatrixTable(structure, where, previous?.structure.kind === 'matrix' ? previous.structure : null);
  expectRefs(frame, where, (target) => onTable(structure, target));
  expectStrips(structure.strips, where);
}

function expectSplitFrame(structure: SplitSnapshot, frame: Frame, where: string, previous: Frame | null): void {
  expect(Object.isFrozen(structure.panes), `${where}: panes frozen`).toBe(true);
  expect(structure.panes.length, `${where}: a split has at least two panes`).toBeGreaterThanOrEqual(2);
  const ids = structure.panes.map((pane) => pane.id);
  expect(new Set(ids).size, `${where}: duplicate pane ids`).toBe(ids.length);

  const before = previous?.structure.kind === 'split' ? previous.structure : null;
  if (before !== null) {
    expect(ids, `${where}: panes are fixed for the run`).toEqual(before.panes.map((pane) => pane.id));
    expect(structure.panes.map((pane) => pane.title), `${where}: pane titles`).toEqual(before.panes.map((pane) => pane.title));
  }
  for (const [at, pane] of structure.panes.entries()) {
    expect(pane.title.length, `${where}: pane ${pane.id} title`).toBeGreaterThan(0);
    expect(pane.view.strips, `${where}: pane ${pane.id} strips belong to the frame`).toHaveLength(0);
    expectMatrixTable(pane.view, `${where} pane ${pane.id}`, before?.panes[at]?.view ?? null);
  }

  const byId = new Map(structure.panes.map((pane) => [pane.id, pane.view] as const));
  expectRefs(frame, where, (target) => {
    const scoped = parsePaneRef(target);
    const view = scoped === null ? undefined : byId.get(scoped.pane);
    return scoped !== null && view !== undefined && onTable(view, scoped.ref);
  });
  expectStrips(structure.strips, where);
}

function expectGridFrame(structure: GridSnapshot, frame: Frame, where: string, previous: Frame | null): void {
  const { rows, cols } = structure;
  expect(rows, `${where}: rows`).toBeGreaterThan(0);
  expect(cols, `${where}: cols`).toBeGreaterThan(0);
  const before = previous?.structure.kind === 'grid' ? previous.structure : null;
  if (before !== null) {
    expect([rows, cols, structure.piece, structure.checkered, structure.boxes], `${where}: the board is fixed for the run`).toEqual([
      before.rows,
      before.cols,
      before.piece,
      before.checkered,
      before.boxes,
    ]);
    expect(structure.fixed, `${where}: the givens are fixed for the run`).toEqual(before.fixed);
    expect(structure.tree === null, `${where}: a search tree is there for the whole run or not at all`).toBe(before.tree === null);
  }

  expect(Object.isFrozen(structure.cells), `${where}: cells frozen`).toBe(true);
  expect(Object.isFrozen(structure.lines), `${where}: lines frozen`).toBe(true);
  expect(structure.cells.length, `${where}: cell count`).toBe(rows * cols);
  expect(structure.rowHeaders.length, `${where}: row headers`).toBe(rows);
  expect(structure.colHeaders.length, `${where}: column headers`).toBe(cols);
  expect(
    firstBad(structure.cells, (value) => value === null || (value.length >= 1 && value.length <= MAX_LETTER_LENGTH)),
    `${where}: square value`,
  ).toBeNull();

  if (structure.boxes !== null) {
    expect([rows % structure.boxes.rows, cols % structure.boxes.cols], `${where}: boxes tile the board`).toEqual([0, 0]);
  }
  if (structure.fixed !== null) {
    expect(structure.fixed.length, `${where}: one given flag per square`).toBe(rows * cols);
    expect(firstBad(structure.fixed.map((given, at) => !given || structure.cells[at] !== null), (ok) => ok), `${where}: a given square is empty`).toBeNull();
  }
  if (structure.marks !== null) {
    expect(Object.isFrozen(structure.marks), `${where}: marks frozen`).toBe(true);
    expect(structure.marks.length, `${where}: one mark slot per square`).toBe(rows * cols);
    expect(
      firstBad(structure.marks.map((mark, at) => mark === null || (structure.cells[at] === null && mark.length >= 1 && mark.length <= Math.max(rows, cols))), (ok) => ok),
      `${where}: pencil marks on a filled square, or too many`,
    ).toBeNull();
  }

  const square = (cell: { readonly row: number; readonly col: number }): boolean =>
    Number.isInteger(cell.row) && Number.isInteger(cell.col) && cell.row >= 0 && cell.col >= 0 && cell.row < rows && cell.col < cols;
  expect(firstBad(structure.lines, (line) => square(line.from) && square(line.to)), `${where}: line off the board`).toBeNull();

  const onBoard = (target: string): boolean => {
    const ref = parseMatrixRef(target);
    if (ref === null) return false;
    if (ref.kind === 'cell') return square(ref);
    return ref.index < (ref.kind === 'row' ? rows : cols);
  };
  const nodes = new Set(structure.tree?.nodes.map((node) => node.id) ?? []);
  if (structure.tree !== null) expectTreeShape(structure.tree, `${where} tree`);

  expect(
    firstBad(Object.entries(frame.pointers), ([, target]) => typeof target === 'string' && (onBoard(target) || nodes.has(target))),
    `${where}: pointer off the board`,
  ).toBeNull();
  for (const [role, targets] of Object.entries(frame.highlights)) {
    expect(
      firstBad(targets ?? [], (target) => typeof target === 'string' && (onBoard(target) || nodes.has(target) || STRIP_REF.test(target))),
      `${where}: highlight ${role} off the board`,
    ).toBeNull();
  }
  expectStrips(structure.strips, where);
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
