import { describe, expect, it } from 'vitest';

import {
  aboveRange,
  besideRange,
  BIG_STEP,
  BOTTOM_MIN,
  DEFAULT_LAYOUT,
  isDefaultLayout,
  keyAction,
  LAYOUT_KEY,
  loadLayout,
  moveCanvas,
  parseLayout,
  saveLayout,
  separatorValues,
  SIDE_MIN,
  stackedRange,
  STEP,
  stripsScale,
  type LayoutStorage,
} from './panels';
import { VIEW_H, VIEW_W } from '../renderers/canvas';
import { graphBandBottom } from '../renderers/GraphRenderer';
import { bandHeight, STRIP_HEIGHT } from '../renderers/strips';
import { stripsHeight } from '../renderers/StripsPanel';

function memoryStore(initial: Record<string, string> = {}): LayoutStorage & { readonly data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

const throwing: LayoutStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('panels: saved sizes', () => {
  it('round-trips a layout through storage under its namespaced key', () => {
    const store = memoryStore();
    const layout = { side: 400, sideCollapsed: true, bottom: 120, stripsCollapsed: false, stacked: 360 };
    saveLayout(layout, store);
    expect(Object.keys(store.data)).toEqual([LAYOUT_KEY]);
    expect(LAYOUT_KEY.startsWith('treewidth.')).toBe(true);
    expect(loadLayout(store)).toEqual(layout);
  });

  it('removes the key for a default layout, so a reset leaves nothing behind', () => {
    const store = memoryStore({ [LAYOUT_KEY]: JSON.stringify({ side: 300 }) });
    saveLayout(DEFAULT_LAYOUT, store);
    expect(store.data).toEqual({});
  });

  it('falls back to defaults on missing, broken or hostile data, field by field', () => {
    expect(parseLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout('{not json')).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout('[]')).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout('null')).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout(JSON.stringify({ side: 'wide', bottom: -4, stacked: 1e9, sideCollapsed: 'yes', stripsCollapsed: true }))).toEqual({
      ...DEFAULT_LAYOUT,
      stripsCollapsed: true,
    });
  });

  it('never throws when storage does', () => {
    expect(loadLayout(throwing)).toEqual(DEFAULT_LAYOUT);
    expect(() => saveLayout({ ...DEFAULT_LAYOUT, side: 300 }, throwing)).not.toThrow();
    expect(loadLayout(null)).toEqual(DEFAULT_LAYOUT);
  });

  it('knows a default layout when it sees one', () => {
    expect(isDefaultLayout(DEFAULT_LAYOUT)).toBe(true);
    expect(isDefaultLayout({ ...DEFAULT_LAYOUT, stripsCollapsed: true })).toBe(false);
  });
});

describe('panels: the canvas never collapses', () => {
  it('keeps the canvas at 40% of the width or more, and the side panel at its minimum', () => {
    for (const width of [900, 1366, 2560]) {
      const range = besideRange(width);
      expect(range.min).toBeCloseTo(width * 0.4, 9);
      expect(range.max).toBe(width - SIDE_MIN);
    }
  });

  it('keeps the canvas at 45% of the height or more, above the strips and explanation', () => {
    for (const height of [300, 600, 1000]) {
      const range = aboveRange(height);
      expect(range.min).toBeCloseTo(height * 0.45, 9);
      expect(range.max).toBe(height - BOTTOM_MIN);
    }
  });

  it('stacked, keeps the canvas between 45% of the window and all of it', () => {
    expect(stackedRange(400)).toEqual({ total: 400, min: 180, max: 400 });
  });

  it('degrades to a single point rather than an inverted range in a tiny box', () => {
    const range = aboveRange(80);
    expect(range.min).toBeLessThanOrEqual(range.max);
  });
});

describe('panels: keys', () => {
  it('moves along the axis only: 16 px, 64 with Shift, forwards grows the canvas', () => {
    expect(keyAction('ArrowLeft', false, 'vertical')).toEqual({ kind: 'step', delta: -STEP });
    expect(keyAction('ArrowRight', true, 'vertical')).toEqual({ kind: 'step', delta: BIG_STEP });
    expect(keyAction('ArrowUp', false, 'vertical')).toBeNull();
    expect(keyAction('ArrowUp', true, 'horizontal')).toEqual({ kind: 'step', delta: -BIG_STEP });
    expect(keyAction('ArrowDown', false, 'horizontal')).toEqual({ kind: 'step', delta: STEP });
    expect(keyAction('ArrowLeft', false, 'horizontal')).toBeNull();
    expect(STEP).toBe(16);
    expect(BIG_STEP).toBe(64);
  });

  it('sends Home and End to the limits and Enter to collapse or restore', () => {
    expect(keyAction('Home', false, 'vertical')).toEqual({ kind: 'min' });
    expect(keyAction('End', false, 'horizontal')).toEqual({ kind: 'max' });
    expect(keyAction('Enter', false, 'vertical')).toEqual({ kind: 'toggle' });
    expect(keyAction('a', false, 'vertical')).toBeNull();
  });

  it('clamps every move to the range', () => {
    const range = besideRange(1000);
    expect(moveCanvas(700, range, { kind: 'step', delta: 16 })).toBe(716);
    expect(moveCanvas(range.max - 4, range, { kind: 'step', delta: 64 })).toBe(range.max);
    expect(moveCanvas(range.min + 4, range, { kind: 'step', delta: -64 })).toBe(range.min);
    expect(moveCanvas(700, range, { kind: 'min' })).toBe(range.min);
    expect(moveCanvas(700, range, { kind: 'max' })).toBe(range.max);
  });
});

describe('panels: separator values', () => {
  it('reports the canvas share as whole percentages', () => {
    expect(separatorValues(640, besideRange(1000), false)).toEqual({ now: 64, min: 40, max: 73 });
  });

  it('reports 100 when the far pane is collapsed', () => {
    expect(separatorValues(1000, besideRange(1000), true)).toEqual({ now: 100, min: 40, max: 100 });
  });

  it('keeps now inside min and max even when the measured canvas strays from them', () => {
    const values = separatorValues(10, aboveRange(500), false);
    expect(values.now).toBe(values.min);
  });
});

describe('the strips are drawn no larger than the canvas', () => {
  /**
   * The page's loop, in numbers: the strips start at their natural width (a
   * view unit to a pixel at most), the canvas takes the height they leave,
   * and each resize sets the strips' scale again from what is measured.
   */
  function settle(total: number, width: number, canvasView: number, stripsView: number): { strips: number; canvas: number; rounds: number } {
    const natural = Math.min(1, width / VIEW_W);
    let strips = natural;
    for (let rounds = 1; rounds <= 10; rounds++) {
      const canvasHeight = total - strips * stripsView;
      const next = Math.min(natural, stripsScale({ canvasWidth: width, canvasHeight, viewWidth: VIEW_W, canvasView, stripsHeight: strips * stripsView, stripsView, coupled: true }));
      if (Math.abs(next - strips) < 1e-9) return { strips, canvas: Math.min(width / VIEW_W, canvasHeight / canvasView), rounds };
      strips = next;
    }
    throw new Error('did not settle');
  }

  it('crops graph views so that view and strips together never exceed the old single view', () => {
    for (const strips of [1, 2, 3]) {
      const view = bandHeight(graphBandBottom(strips), strips);
      expect(view + stripsHeight(strips), `${strips} strips`).toBeLessThanOrEqual(VIEW_H);
      expect(stripsHeight(strips)).toBe(strips * STRIP_HEIGHT);
    }
  });

  it('settles within three resizes, never above the canvas, and never draws the canvas smaller than the single view did', () => {
    for (const strips of [1, 2, 3]) {
      const canvasView = bandHeight(graphBandBottom(strips), strips);
      const stripsView = stripsHeight(strips);
      for (let total = 150; total <= 1400; total += 25) {
        for (let width = 300; width <= 2600; width += 100) {
          const result = settle(total, width, canvasView, stripsView);
          expect(result.rounds).toBeLessThanOrEqual(3);
          expect(result.strips).toBeLessThanOrEqual(result.canvas + 1e-9);
          // Before the strips had a panel, the same height held one view of VIEW_H units.
          const before = Math.min(width / VIEW_W, total / VIEW_H);
          expect(result.canvas, `total ${total}, width ${width}, ${strips} strips`).toBeGreaterThanOrEqual(before - 1e-9);
        }
      }
    }
  });

  it("follows the canvas alone when the canvas doesn't depend on them", () => {
    const at = { canvasWidth: 900, canvasHeight: 300, viewWidth: VIEW_W, canvasView: 424, stripsHeight: 92, stripsView: 92 };
    expect(stripsScale({ ...at, coupled: false })).toBe(Math.floor((300 / 424) * 1000) / 1000);
    expect(stripsScale({ ...at, coupled: true })).toBeLessThanOrEqual(300 / 424);
    expect(stripsScale({ ...at, canvasView: 0, coupled: true })).toBe(0);
  });
});
