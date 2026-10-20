/** Input plumbing shared by the graph algorithms: the edge-list language, presets and the URL cap. */

import { seedField } from './arrayInput';
import type { FieldSpec, ParamMap, ParseResult, PresetSpec } from './define';
import { gridColumns, LAYOUT_ASPECT, layoutGraph, layoutViolations, ringMaxNodes, type EdgePair, type LayoutKind, type Point } from './graphLayout';
import { randomInt, shuffle } from './random';
import type { Graph, GraphEdge, GraphNode } from './types';

export const MAX_GRAPH_NODES = 150;
export const MAX_GRAPH_EDGES = 600;

/** Ring presets stop here: past it, neighbours on one ring sit closer than a node apart. */
export const RING_MAX_NODES = ringMaxNodes(MAX_GRAPH_NODES);
export const RING_CAP_REASON = 'so neighbours on the ring stay at least a node apart';

export interface EdgeListEdge {
  readonly from: number;
  readonly to: number;
  readonly weight?: number;
}

export interface EdgeList {
  readonly nodeCount: number;
  readonly edges: readonly EdgeListEdge[];
  readonly weighted: boolean;
}

export interface EdgeListOptions {
  /** Every edge must carry a weight (Dijkstra). */
  readonly requireWeights?: boolean;
  readonly directed?: boolean;
}

const TOKEN = /^(\d+)(?:-(\d+)(?::(-?\d+(?:\.\d+)?))?)?$/;

/** The edge-list text with any true minus (U+2212) turned back into an ASCII hyphen. */
export function toAsciiMinus(text: string): string {
  return text.replace(/−/g, '-');
}

export function parseEdgeList(raw: string, options: EdgeListOptions = {}): ParseResult<EdgeList> {
  // A true minus (U+2212), as the canvas draws negative weights, pastes back in as a hyphen.
  const tokens = toAsciiMinus(raw).split(/[\s,;]+/).filter((token) => token.length > 0);
  if (tokens.length === 0) return { ok: false, error: 'Give at least one edge, like 0-1.' };

  const edges: EdgeListEdge[] = [];
  const seen = new Set<string>();
  let maxId = -1;
  let weightedCount = 0;

  for (const token of tokens) {
    const match = TOKEN.exec(token);
    if (match === null) return { ok: false, error: `Cannot read "${token}". Use a-b, a-b:weight, or a lone node id.` };
    const from = Number(match[1]);
    if (from > maxId) maxId = from;
    if (match[2] === undefined) continue;
    const to = Number(match[2]);
    if (to > maxId) maxId = to;
    if (from === to) return { ok: false, error: `${token} is a self-loop; an edge must join two different nodes.` };
    const key = options.directed === true ? `${from}>${to}` : `${Math.min(from, to)}-${Math.max(from, to)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (match[3] !== undefined) {
      weightedCount += 1;
      edges.push({ from, to, weight: Number(match[3]) });
    } else {
      edges.push({ from, to });
    }
  }

  const nodeCount = maxId + 1;
  if (nodeCount > MAX_GRAPH_NODES) return { ok: false, error: `Node ids go up to ${maxId}; the cap is ${MAX_GRAPH_NODES} nodes (ids 0-${MAX_GRAPH_NODES - 1}).` };
  if (edges.length > MAX_GRAPH_EDGES) return { ok: false, error: `${edges.length} edges; the cap is ${MAX_GRAPH_EDGES}.` };
  if (options.requireWeights === true && weightedCount < edges.length) {
    return { ok: false, error: 'Every edge needs a weight here, like 0-1:4.' };
  }
  return { ok: true, value: { nodeCount, edges, weighted: edges.length > 0 && weightedCount === edges.length } };
}

export function formatEdgeList(edges: readonly EdgeListEdge[], isolated: readonly number[] = []): string {
  const parts = edges.map((edge) => (edge.weight === undefined ? `${edge.from}-${edge.to}` : `${edge.from}-${edge.to}:${edge.weight}`));
  return [...parts, ...isolated.map(String)].join(',');
}

/** Layouts kept: a preset's clearance check lays its graph out, and the level's parse then asks for the same one. */
const RECENT_LAYOUTS = 4;
const recentLayouts: { readonly key: string; readonly points: readonly Point[] }[] = [];

/** layoutGraph, remembered for the last few graphs. It is a pure function of these arguments, so a hit is the same layout. */
function layoutOf(nodeCount: number, pairs: readonly EdgePair[], layout: LayoutKind): readonly Point[] {
  const key = `${layout}|${nodeCount}|${pairs.map(([a, b]) => `${a}-${b}`).join(',')}`;
  const hit = recentLayouts.find((entry) => entry.key === key);
  if (hit !== undefined) return hit.points;
  const points = Object.freeze(layoutGraph(nodeCount, pairs, layout).map((point) => Object.freeze(point)));
  recentLayouts.unshift({ key, points });
  recentLayouts.length = Math.min(recentLayouts.length, RECENT_LAYOUTS);
  return points;
}

/**
 * Positions placed by hand in the graph editor, in layout units (x across 0..1,
 * y down 0..1 / LAYOUT_ASPECT). The `pos` param carries them within a tab but
 * is never written to the URL: a link shares topology only. See CONTRIBUTING
 * "Graphs".
 */
export const POSITIONS_PARAM = 'pos';

export function formatPositions(points: readonly Point[]): string {
  const round = (value: number): string => String(Math.round(value * 10000) / 10000);
  return points.map((point) => `${round(point.x)},${round(point.y)}`).join(';');
}

/** One point per node, each inside the layout box, or null: a list for another graph is ignored, not half-used. */
export function parsePositions(raw: string | undefined, nodeCount: number): readonly Point[] | null {
  if (raw === undefined || raw === '' || nodeCount === 0) return null;
  const parts = raw.split(';');
  if (parts.length !== nodeCount) return null;
  const points: Point[] = [];
  for (const part of parts) {
    const [x, y, extra] = part.split(',').map(Number);
    if (extra !== undefined || x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < 0 || x > 1 || y < 0 || y > 1 / LAYOUT_ASPECT) return null;
    points.push({ x, y });
  }
  return points;
}

/** The run's graph: laid out by `layout`, unless hand-placed positions for exactly these nodes come with it. */
export function buildGraph(list: EdgeList, directed: boolean, layout: LayoutKind, placed: readonly Point[] | null = null): Graph {
  const pairs: EdgePair[] = list.edges.map((edge) => [edge.from, edge.to]);
  const points = placed !== null && placed.length === list.nodeCount ? placed : layoutOf(list.nodeCount, pairs, layout);
  const nodes: GraphNode[] = points.map((point, i) => ({ id: String(i), label: String(i), x: point.x, y: point.y }));
  const edges: GraphEdge[] = list.edges.map((edge, i) => ({
    id: `e${i}`,
    from: String(edge.from),
    to: String(edge.to),
    ...(edge.weight === undefined ? {} : { weight: edge.weight }),
  }));
  return { directed, weighted: list.weighted, nodes, edges };
}

export function parseDirected(raw: string | undefined): boolean {
  return raw === '1' || raw === 'true' || raw === 'yes';
}

const LAYOUTS: readonly LayoutKind[] = ['auto', 'ring', 'grid'];

export function parseLayout(raw: string | undefined): LayoutKind {
  return LAYOUTS.find((kind) => kind === raw) ?? 'auto';
}

export function parseStart(raw: string | undefined, nodeCount: number): ParseResult<number> {
  const start = raw === undefined || raw.trim() === '' ? 0 : Number(raw);
  if (!Number.isInteger(start) || start < 0 || start >= nodeCount) {
    return { ok: false, error: `Start node must be an id from 0 to ${nodeCount - 1}.` };
  }
  return { ok: true, value: start };
}

/* ---------------- fields ---------------- */

export function edgesField(defaultValue: string, weighted: boolean): FieldSpec {
  return {
    key: 'g',
    label: 'Edges',
    kind: 'edges',
    defaultValue,
    placeholder: weighted ? '0-1:4, 1-2:7, 5' : '0-1, 1-2, 5',
    help: weighted
      ? 'a-b:weight per edge, separated by commas or newlines. A lone id is an isolated node.'
      : 'a-b per edge, separated by commas or newlines. A lone id is an isolated node.',
  };
}

export const directedField: FieldSpec = {
  key: 'directed',
  label: 'Edges are',
  kind: 'select',
  defaultValue: '0',
  options: [
    { value: '0', label: 'Undirected' },
    { value: '1', label: 'Directed (a-b goes a to b)' },
  ],
};

/** For algorithms defined only on directed graphs: the same choice, Directed by default; parse refuses Undirected with a reason. */
export const directedOnlyField: FieldSpec = { ...directedField, defaultValue: '1' };

export const layoutField: FieldSpec = {
  key: 'layout',
  label: 'Layout',
  kind: 'select',
  defaultValue: 'auto',
  options: [
    { value: 'auto', label: 'Force-directed' },
    { value: 'ring', label: 'Ring' },
    { value: 'grid', label: 'Grid' },
  ],
};

export const startField: FieldSpec = {
  key: 'start',
  label: 'Start node',
  kind: 'number',
  defaultValue: '0',
  min: 0,
  max: MAX_GRAPH_NODES - 1,
};

/** Node count for the size slider: the edge list decides it, not a value count. */
export function graphSizeOf(params: ParamMap): number {
  const parsed = parseEdgeList(params.g ?? '');
  return parsed.ok ? parsed.value.nodeCount : 0;
}

/* ---------------- presets ---------------- */

/** Graphs a preset builds, at most, looking for one whose layout is clear. */
export const PRESET_TRIES = 5;

/** layoutViolations of the graph these params describe, laid out as the level will lay it out. */
export function presetViolations(params: ParamMap): number {
  const list = parseEdgeList(params.g ?? '', { directed: parseDirected(params.directed) });
  if (!list.ok) return 0;
  const pairs: EdgePair[] = list.value.edges.map((edge) => [edge.from, edge.to]);
  return layoutViolations(layoutOf(list.value.nodeCount, pairs, parseLayout(params.layout)), pairs);
}

/**
 * The presets, each regenerated until its layout is clear: if the graph a
 * preset builds leaves an edge too close to a node or two nodes crowded, it
 * builds another, drawing on from the same seeded stream, up to PRESET_TRIES
 * graphs in all. If none is clear, the one with the fewest violations is used,
 * and the notice under the canvas (ClearanceNotice) says how many edges pass close.
 * The first graph is exactly what the preset built before, so a preset that
 * was already clear builds the same graph from the same seed.
 */
export function regenerating(presets: readonly PresetSpec[]): readonly PresetSpec[] {
  return presets.map((preset) => ({
    ...preset,
    build: (size: number, rng: () => number): ParamMap => {
      let best = preset.build(size, rng);
      let fewest = presetViolations(best);
      for (let attempt = 1; attempt < PRESET_TRIES && fewest > 0; attempt++) {
        const next = preset.build(size, rng);
        const violations = presetViolations(next);
        if (violations < fewest) {
          best = next;
          fewest = violations;
        }
      }
      return best;
    },
  }));
}

export interface GraphPresetOptions {
  readonly weighted: boolean;
  /** Presets that pick a start node write it here. */
  readonly withStart?: boolean;
}

function weightOf(rng: () => number, weighted: boolean): { weight?: number } {
  return weighted ? { weight: randomInt(rng, 1, 9) } : {};
}

function randomTree(size: number, rng: () => number, weighted: boolean): EdgeListEdge[] {
  const edges: EdgeListEdge[] = [];
  for (let i = 1; i < size; i++) edges.push({ from: randomInt(rng, Math.max(0, i - 4), i - 1), to: i, ...weightOf(rng, weighted) });
  return edges;
}

function sprinkle(edges: EdgeListEdge[], size: number, extra: number, rng: () => number, weighted: boolean): EdgeListEdge[] {
  const seen = new Set(edges.map((edge) => `${Math.min(edge.from, edge.to)}-${Math.max(edge.from, edge.to)}`));
  let attempts = 0;
  while (extra > 0 && attempts < extra * 20) {
    attempts += 1;
    const a = randomInt(rng, 0, size - 1);
    const b = randomInt(rng, 0, size - 1);
    if (a === b) continue;
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ from: Math.min(a, b), to: Math.max(a, b), ...weightOf(rng, weighted) });
    extra -= 1;
  }
  return edges;
}

function lattice(size: number, rng: () => number, weighted: boolean): EdgeListEdge[] {
  const cols = gridColumns(size);
  const edges: EdgeListEdge[] = [];
  for (let i = 0; i < size; i++) {
    if ((i + 1) % cols !== 0 && i + 1 < size) edges.push({ from: i, to: i + 1, ...weightOf(rng, weighted) });
    if (i + cols < size) edges.push({ from: i, to: i + cols, ...weightOf(rng, weighted) });
  }
  return edges;
}

export function graphPresets(options: GraphPresetOptions): readonly PresetSpec[] {
  const { weighted } = options;
  const finish = (edges: readonly EdgeListEdge[], size: number, rng: () => number, layout: LayoutKind): ParamMap => {
    const touched = new Set<number>();
    for (const edge of edges) {
      touched.add(edge.from);
      touched.add(edge.to);
    }
    const isolated = Array.from({ length: size }, (_, i) => i).filter((i) => !touched.has(i));
    return {
      g: formatEdgeList(edges, isolated),
      layout,
      seed: String(randomInt(rng, 0, 999999)),
      ...(options.withStart === false ? {} : { start: '0' }),
    };
  };

  return regenerating([
    {
      id: 'random',
      label: 'Random sparse',
      build: (size, rng) => finish(sprinkle(randomTree(size, rng, weighted), size, Math.round(size * 0.5), rng, weighted), size, rng, 'auto'),
    },
    {
      id: 'grid',
      label: 'Grid',
      build: (size, rng) => finish(lattice(size, rng, weighted), size, rng, 'grid'),
    },
    {
      id: 'tree',
      label: 'Tree',
      build: (size, rng) => finish(randomTree(size, rng, weighted), size, rng, 'auto'),
    },
    {
      id: 'ring',
      label: 'Ring with chords',
      maxSize: RING_MAX_NODES,
      capReason: RING_CAP_REASON,
      build: (requested, rng) => {
        const size = Math.min(requested, RING_MAX_NODES);
        const edges: EdgeListEdge[] = [];
        for (let i = 0; i < size; i++) edges.push({ from: i, to: (i + 1) % size, ...weightOf(rng, weighted) });
        const chords = shuffle(Array.from({ length: size }, (_, i) => i), rng).slice(0, Math.max(1, Math.floor(size / 5)));
        for (const i of chords) {
          const j = (i + Math.floor(size / 2)) % size;
          if (i !== j) edges.push({ from: Math.min(i, j), to: Math.max(i, j), ...weightOf(rng, weighted) });
        }
        return finish(edges, size, rng, 'ring');
      },
    },
    {
      id: 'islands',
      label: 'Two islands',
      build: (size, rng) => {
        const half = Math.max(2, Math.floor(size / 2));
        const left = sprinkle(randomTree(half, rng, weighted), half, Math.round(half * 0.4), rng, weighted);
        const rest = size - half;
        const right = sprinkle(randomTree(rest, rng, weighted), rest, Math.round(rest * 0.4), rng, weighted).map((edge) => ({
          ...edge,
          from: edge.from + half,
          to: edge.to + half,
        }));
        return finish([...left, ...right], size, rng, 'auto');
      },
    },
  ]);
}

export { seedField };
