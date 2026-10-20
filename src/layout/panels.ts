/**
 * The visualize page's resizable layout, as pure data and arithmetic so it can
 * be tested without a browser. See CONTRIBUTING "Layout".
 *
 * Every splitter is described by the canvas it controls: its value is the
 * canvas's share of the space the splitter divides, the canvas always sits
 * before the splitter (to its left, or above it), and moving the splitter
 * forwards (right, down) grows the canvas. Enter collapses the pane on the
 * splitter's far side: the side panel, or the strips. The canvas itself never
 * collapses.
 */

/** Below this viewport width the panels stack and every splitter is horizontal. */
export const STACK_BELOW = 900;

/** The canvas never gets less than this share of the width beside the side panel. */
export const CANVAS_MIN_WIDTH = 0.4;
/** Nor less than this share of the height above the strips and explanation (or of the window, when stacked). */
export const CANVAS_MIN_HEIGHT = 0.45;
/** The narrowest the side panel goes while open. */
export const SIDE_MIN = 272;
/** The shortest the strips-and-explanation area goes: the explanation's two lines. */
export const BOTTOM_MIN = 64;

export const STEP = 16;
export const BIG_STEP = 64;

/** Saved per viewer; see the privacy note on /about. Bump the version if the shape changes. */
export const LAYOUT_KEY = 'treewidth.layout.v1';

export interface PanelLayout {
  /** Side panel width in px, beside the canvas; null is the stylesheet's default. */
  readonly side: number | null;
  readonly sideCollapsed: boolean;
  /** Strips-and-explanation height in px, under the canvas; null fits its content. */
  readonly bottom: number | null;
  readonly stripsCollapsed: boolean;
  /** Canvas height in px when the panels are stacked; null is the stylesheet's default. */
  readonly stacked: number | null;
}

export const DEFAULT_LAYOUT: PanelLayout = { side: null, sideCollapsed: false, bottom: null, stripsCollapsed: false, stacked: null };

export function isDefaultLayout(layout: PanelLayout): boolean {
  return (Object.keys(DEFAULT_LAYOUT) as (keyof PanelLayout)[]).every((key) => layout[key] === DEFAULT_LAYOUT[key]);
}

function size(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 100000 ? Math.round(value) : null;
}

/** A saved layout, field by field: anything missing or malformed falls back to its default. */
export function parseLayout(raw: string | null): PanelLayout {
  if (raw === null) return DEFAULT_LAYOUT;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_LAYOUT;
  }
  if (typeof data !== 'object' || data === null) return DEFAULT_LAYOUT;
  const record = data as Record<string, unknown>;
  return {
    side: size(record.side),
    sideCollapsed: record.sideCollapsed === true,
    bottom: size(record.bottom),
    stripsCollapsed: record.stripsCollapsed === true,
    stacked: size(record.stacked),
  };
}

export interface LayoutStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

function storage(): LayoutStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Private windows, blocked storage and quota errors all read as "nothing saved". */
export function loadLayout(store: LayoutStorage | null = storage()): PanelLayout {
  try {
    return parseLayout(store?.getItem(LAYOUT_KEY) ?? null);
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/** A default layout removes the key, so a reset leaves nothing behind. */
export function saveLayout(layout: PanelLayout, store: LayoutStorage | null = storage()): void {
  try {
    if (store === null) return;
    if (isDefaultLayout(layout)) store.removeItem(LAYOUT_KEY);
    else store.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // Nothing to do: the layout still applies for this visit.
  }
}

/** The canvas sizes one splitter allows, in px, out of `total`. */
export interface CanvasRange {
  readonly total: number;
  readonly min: number;
  readonly max: number;
}

function range(total: number, min: number, max: number): CanvasRange {
  const low = Math.max(0, Math.min(min, total));
  return { total, min: low, max: Math.max(low, Math.min(max, total)) };
}

/** Beside the side panel: the canvas keeps 40% of the row, the panel keeps its minimum width. */
export function besideRange(rowWidth: number): CanvasRange {
  return range(rowWidth, rowWidth * CANVAS_MIN_WIDTH, rowWidth - SIDE_MIN);
}

/** Above the strips and explanation: the canvas keeps 45% of the height, they keep their minimum. */
export function aboveRange(regionHeight: number): CanvasRange {
  return range(regionHeight, regionHeight * CANVAS_MIN_HEIGHT, regionHeight - BOTTOM_MIN);
}

/** Stacked: the canvas is between 45% of the window's height and all of it. */
export function stackedRange(viewHeight: number): CanvasRange {
  return range(viewHeight, viewHeight * CANVAS_MIN_HEIGHT, viewHeight);
}

export function clampCanvas(canvas: number, bounds: CanvasRange): number {
  return Math.min(bounds.max, Math.max(bounds.min, canvas));
}

export type SplitAction =
  | { readonly kind: 'step'; readonly delta: number }
  | { readonly kind: 'min' }
  | { readonly kind: 'max' }
  | { readonly kind: 'toggle' };

/**
 * What a key does on a focused splitter. Only the keys along its axis move it:
 * left and right on a vertical splitter, up and down on a horizontal one.
 * Forwards (right, down) grows the canvas.
 */
export function keyAction(key: string, shift: boolean, orientation: 'vertical' | 'horizontal'): SplitAction | null {
  const step = shift ? BIG_STEP : STEP;
  const back = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp';
  const forth = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown';
  if (key === back) return { kind: 'step', delta: -step };
  if (key === forth) return { kind: 'step', delta: step };
  if (key === 'Home') return { kind: 'min' };
  if (key === 'End') return { kind: 'max' };
  if (key === 'Enter') return { kind: 'toggle' };
  return null;
}

/** The canvas size after a step or a jump, within its range. */
export function moveCanvas(canvas: number, bounds: CanvasRange, action: SplitAction): number {
  switch (action.kind) {
    case 'step':
      return clampCanvas(canvas + action.delta, bounds);
    case 'min':
      return bounds.min;
    case 'max':
      return bounds.max;
    case 'toggle':
      return canvas;
  }
}

export interface SeparatorValues {
  readonly now: number;
  readonly min: number;
  readonly max: number;
}

/** aria-valuenow, -min and -max as whole percentages of the canvas's share. A collapsed far pane leaves the canvas everything. */
export function separatorValues(canvas: number, bounds: CanvasRange, collapsed: boolean): SeparatorValues {
  if (bounds.total <= 0) return { now: 100, min: 0, max: 100 };
  const percent = (px: number): number => Math.round((px / bounds.total) * 100);
  if (collapsed) return { now: 100, min: percent(bounds.min), max: 100 };
  const min = percent(bounds.min);
  const max = percent(bounds.max);
  return { now: Math.min(max, Math.max(min, percent(canvas))), min, max };
}

/** What the strips' scale is worked out from: the canvas's drawing and the strips' own, in px and view units. */
export interface StripsMeasure {
  /** The canvas drawing's box, in px. */
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  /** The view's width (both drawings share it) and the canvas view's height, in view units. */
  readonly viewWidth: number;
  readonly canvasView: number;
  /** The strips drawing's height, in px and in view units. */
  readonly stripsHeight: number;
  readonly stripsView: number;
  /** True when the canvas takes whatever height the strips leave, so drawing them smaller gives it back. */
  readonly coupled: boolean;
}

/**
 * Pixels per view unit for the strips: never more than the canvas's own, so
 * the strips take no more height than they did when they were drawn inside
 * the canvas's view, and the graph is never drawn smaller than it was then.
 *
 * While the canvas takes the height the strips leave, both settle on the
 * share of their combined height, (canvas + strips) / (canvas view + strips
 * view); the minimum with the canvas's current scale holds the rule on the
 * way there and whenever a CSS limit pins the canvas instead. Rounded down,
 * so rounding never puts the strips above the canvas.
 */
export function stripsScale(at: StripsMeasure): number {
  if (at.viewWidth <= 0 || at.canvasView <= 0) return 0;
  const byWidth = at.canvasWidth / at.viewWidth;
  const canvas = Math.min(byWidth, at.canvasHeight / at.canvasView);
  const shared = at.coupled && at.stripsView > 0 ? Math.min(byWidth, (at.canvasHeight + at.stripsHeight) / (at.canvasView + at.stripsView)) : canvas;
  return Math.max(0, Math.floor(Math.min(shared, canvas) * 1000) / 1000);
}
