import { describe, expect, it } from 'vitest';

import { LAYOUT_ASPECT, LAYOUT_MIN_VIEW_SCALE } from '../core/graphLayout';
import {
  arrayBands,
  FLOOR,
  INDEX_ROW_Y,
  LETTER_POINTER_ROOM,
  LETTER_ROW_GAP,
  letterTiles,
  POINTER_ROW_HEIGHT,
  POINTER_ROW_Y,
  TILE_MAX,
  type BandVariant,
} from './ArrayRenderer';
import { VIEW_H, VIEW_W } from './canvas';
import { graphBandBottom, graphBox, GRAPH_TOP } from './GraphRenderer';
import {
  matrixBandBottom,
  matrixLayout,
  matrixStackLayout,
  MATRIX_TOP,
  MAX_CELL,
  PANE_TITLE_H,
  UNDER_H,
  type MatrixShape,
  type PaneShape,
} from './MatrixRenderer';
import { BOARD_SHARE, gridLayout, SQUARE_MAX } from './GridRenderer';
import { PAD_X, STRIP_HEIGHT } from './strips';
import { treeScale, TREE_TOP, type TreeRunBound } from './TreeRenderer';

const STRIP_COUNTS = [0, 1, 2];
const INNER_W = VIEW_W - PAD_X * 2;
/** Three stacked pointer labels is the worst case the array renderer draws. */
const DEEPEST_LABEL = POINTER_ROW_Y + 9 + 2 * POINTER_ROW_HEIGHT;

function bounds(): TreeRunBound[] {
  const out: TreeRunBound[] = [];
  for (const strips of STRIP_COUNTS) {
    for (const depth of [0, 1, 2, 3, 4, 6, 9, 14, 24]) {
      for (const columns of [1, 2, 5, 12, 40, 120, 300]) out.push({ columns, depth, strips });
    }
  }
  return out;
}

describe('tree scale', () => {
  it('spends the whole band on levels instead of letterboxing it', () => {
    for (const bound of bounds()) {
      if (bound.depth === 0) continue;
      const { radius, levelHeight, treeBottom, rootY } = treeScale(bound);
      const band = treeBottom - TREE_TOP;
      const drawn = radius * 2 + bound.depth * levelHeight;
      expect(drawn / band).toBeGreaterThan(0.9);
      expect(rootY - radius).toBeGreaterThanOrEqual(TREE_TOP);
    }
  });

  it('keeps the deepest level inside the band at every bound', () => {
    for (const bound of bounds()) {
      const { radius, levelHeight, treeBottom, rootY, slot, x0 } = treeScale(bound);
      const deepest = rootY + bound.depth * levelHeight + radius;
      expect(deepest).toBeLessThanOrEqual(treeBottom + 1e-9);
      expect(radius).toBeGreaterThanOrEqual(5);
      expect(radius).toBeLessThanOrEqual(17);
      expect(x0).toBeGreaterThanOrEqual(-1e-9);
      expect(x0 + slot * Math.max(1, bound.columns)).toBeLessThanOrEqual(VIEW_W + 1e-9);
    }
  });

  it('leaves room under the strips for every strip count', () => {
    for (const strips of STRIP_COUNTS) {
      const { treeBottom } = treeScale({ columns: 8, depth: 3, strips });
      expect(VIEW_H - treeBottom).toBeGreaterThanOrEqual(strips * STRIP_HEIGHT);
    }
  });
});

describe('letter tiles', () => {
  const SLOTS = [2, 8, 25, 40, 64, 83, 200, 980];

  it('fit inside their slot and their band', () => {
    for (const variant of ['plain', 'heap', 'aux'] as const) {
      const bands = arrayBands(variant);
      for (const slot of SLOTS) {
        const { size, mainY, auxY } = letterTiles(variant, slot);
        expect(size).toBeGreaterThan(0);
        expect(size).toBeLessThanOrEqual(Math.max(4, Math.min(slot, TILE_MAX)));
        expect(mainY).toBeGreaterThanOrEqual(bands.chart.top - 1e-9);
        expect(mainY + size).toBeLessThanOrEqual(bands.chart.bottom + 1e-9);
        if (bands.aux !== null) expect(auxY + size).toBeLessThanOrEqual(bands.aux.bottom + 1e-9);
      }
    }
  });

  it('hang a pattern one label gap under its text, with pointer room above and below', () => {
    for (const slot of SLOTS) {
      const { size, mainY, auxY } = letterTiles('aux', slot);
      const { chart, aux } = arrayBands('aux');
      expect(auxY - (mainY + size)).toBeCloseTo(LETTER_ROW_GAP);
      expect(mainY - LETTER_POINTER_ROOM).toBeGreaterThanOrEqual(chart.top - 1e-9);
      expect(auxY + size + LETTER_POINTER_ROOM).toBeLessThanOrEqual((aux?.bottom ?? 0) + 1e-9);
    }
  });

  it('centre a lone row in its band', () => {
    const { chart } = arrayBands('plain');
    const { size, mainY } = letterTiles('plain', 60);
    expect(mainY - chart.top).toBeCloseTo(chart.bottom - (mainY + size));
  });
});

describe('array bands', () => {
  const variants: BandVariant[] = ['plain', 'heap', 'aux'];

  it('stacks its bands in order and stops at the floor', () => {
    for (const variant of variants) {
      const { chart, tree, aux } = arrayBands(variant);
      for (const band of [tree, chart, aux]) {
        if (band === null) continue;
        expect(band.bottom).toBeGreaterThan(band.top);
        expect(band.top).toBeGreaterThanOrEqual(0);
        expect(band.bottom).toBeLessThanOrEqual(FLOOR);
      }
      if (tree !== null) expect(tree.bottom).toBeLessThan(chart.top);
      if (aux !== null) expect(chart.bottom).toBeLessThan(aux.top);
    }
  });

  it('spends the viewBox height on the drawing, not on margin', () => {
    for (const variant of variants) {
      const { chart, tree } = arrayBands(variant);
      const top = tree === null ? chart.top : tree.top;
      expect((FLOOR - top) / VIEW_H).toBeGreaterThan(0.78);
    }
  });

  it('fits the index row and three stacked pointer labels below the floor', () => {
    expect(INDEX_ROW_Y).toBeGreaterThan(FLOOR);
    expect(POINTER_ROW_Y).toBeGreaterThan(INDEX_ROW_Y);
    expect(DEEPEST_LABEL).toBeLessThanOrEqual(VIEW_H);
  });
});

describe('graph box', () => {
  it('fills the band it is fitted into rather than sitting letterboxed in it', () => {
    for (const strips of STRIP_COUNTS) {
      const bottom = graphBandBottom(strips);
      const innerH = bottom - GRAPH_TOP;
      const { scale, x0, y0 } = graphBox(bottom);
      const height = scale / LAYOUT_ASPECT;
      expect(scale).toBeLessThanOrEqual(INNER_W + 1e-9);
      expect(x0).toBeGreaterThanOrEqual((VIEW_W - INNER_W) / 2 - 1e-9);
      expect(y0).toBeGreaterThanOrEqual(GRAPH_TOP - 1e-9);
      expect(y0 + height).toBeLessThanOrEqual(bottom + 1e-9);
      expect(height / innerH).toBeGreaterThan(0.85);
    }
  });

  it('never draws the layout box narrower than the scale the layout keeps edges clear at', () => {
    for (const strips of STRIP_COUNTS) expect(graphBox(graphBandBottom(strips)).scale).toBeGreaterThanOrEqual(LAYOUT_MIN_VIEW_SCALE);
  });

  it('leaves room under the strips for every strip count', () => {
    for (const strips of STRIP_COUNTS) {
      expect(VIEW_H - graphBandBottom(strips)).toBeGreaterThanOrEqual(strips * STRIP_HEIGHT);
    }
  });
});

describe('matrix layout', () => {
  function shapes(): MatrixShape[] {
    const out: MatrixShape[] = [];
    for (const strips of STRIP_COUNTS) {
      for (const rows of [1, 2, 6, 13, 21, 40]) {
        for (const cols of [1, 2, 7, 13, 16, 30, 60]) {
          for (const header of ['a', '12', 'item 4 (w3)']) {
            for (const rowTitle of ['i', 'i: prefix of a', 'items considered so far']) {
              out.push({ rows, cols, rowHeaders: Array.from({ length: rows }, () => header), rowTitle, strips });
            }
          }
        }
      }
    }
    return out;
  }

  it('keeps the grid, its gutters and its titles inside the band', () => {
    for (const shape of shapes()) {
      const { cell, x0, y0, headerW, titleY, bottom } = matrixLayout(shape);
      expect(cell).toBeGreaterThan(0);
      expect(cell).toBeLessThanOrEqual(MAX_CELL);
      expect(x0 + cell * shape.cols).toBeLessThanOrEqual(VIEW_W - PAD_X + 1e-9);
      expect(x0 - headerW).toBeGreaterThanOrEqual(PAD_X - 1e-9);
      expect(y0 + cell * shape.rows).toBeLessThanOrEqual(bottom + 1e-9);
      expect(titleY).toBeGreaterThanOrEqual(MATRIX_TOP);
    }
  });

  it('spends the band on cells unless they hit the size cap', () => {
    for (const shape of shapes()) {
      const { cell, x0, y0, bottom } = matrixLayout(shape);
      if (cell >= MAX_CELL - 1e-9) continue;
      const fillsWidth = x0 + cell * shape.cols >= VIEW_W - PAD_X - 1e-6;
      const fillsHeight = y0 + cell * shape.rows >= bottom - 1e-6;
      expect(fillsWidth || fillsHeight).toBe(true);
    }
  });

  it('leaves room under the strips for every strip count', () => {
    for (const strips of STRIP_COUNTS) {
      expect(VIEW_H - matrixBandBottom(strips)).toBeGreaterThanOrEqual(strips * STRIP_HEIGHT);
    }
  });
});

describe('stacked matrix layout', () => {
  function under(shape: PaneShape): number {
    return shape.arrowsUnder === true ? UNDER_H : 0;
  }

  function pane(rows: number, cols: number, header = 'item 3'): PaneShape {
    return { rows, cols, rowHeaders: Array.from({ length: rows }, () => header), rowTitle: 'i: items so far' };
  }

  function stacks(): { shapes: PaneShape[]; strips: number }[] {
    const out: { shapes: PaneShape[]; strips: number }[] = [];
    for (const strips of STRIP_COUNTS) {
      for (const rows of [1, 4, 8, 13]) {
        for (const cols of [2, 8, 16, 31]) {
          out.push({ shapes: [pane(rows, cols), pane(1, cols, 'dp')], strips });
          out.push({ shapes: [pane(rows, cols), pane(2, Math.max(1, cols - 3), 'x')], strips });
          // A band kept under a pane: knapsack's rolling row below, LIS's table above.
          out.push({ shapes: [pane(rows, cols), { ...pane(1, cols, 'dp'), arrowsUnder: true }], strips });
          out.push({ shapes: [{ ...pane(2, cols, 'L[i]'), arrowsUnder: true }, pane(rows, cols, 'top')], strips });
        }
      }
    }
    return out;
  }

  it('fits every pane, its lines and its gutters inside the band', () => {
    for (const { shapes, strips } of stacks()) {
      const { cell, x0, left, panes, bottom } = matrixStackLayout(shapes, strips, true);
      expect(cell).toBeGreaterThan(0);
      expect(cell).toBeLessThanOrEqual(MAX_CELL);
      expect(x0 - left).toBeGreaterThanOrEqual(PAD_X - 1e-9);
      for (const [at, place] of panes.entries()) {
        const shape = shapes[at];
        if (shape === undefined) continue;
        expect(x0 + cell * shape.cols).toBeLessThanOrEqual(VIEW_W - PAD_X + 1e-9);
        expect(place.paneTitleY - PANE_TITLE_H / 2).toBeGreaterThanOrEqual(MATRIX_TOP - 1e-9);
        expect(place.y0 + cell * shape.rows + under(shape)).toBeLessThanOrEqual(bottom + 1e-9);
      }
    }
  });

  it('stacks the panes in order without overlap', () => {
    for (const { shapes, strips } of stacks()) {
      const { cell, panes } = matrixStackLayout(shapes, strips, true);
      for (let at = 1; at < panes.length; at++) {
        const above = panes[at - 1];
        const below = panes[at];
        const shape = shapes[at - 1];
        if (above === undefined || below === undefined || shape === undefined) continue;
        expect(above.y0 + shape.rows * cell + under(shape)).toBeLessThan(below.paneTitleY - PANE_TITLE_H / 2);
        expect(below.paneTitleY).toBeLessThan(below.titleY);
        expect(below.titleY).toBeLessThan(below.pointerY + 1e-9);
        expect(below.pointerY).toBeLessThan(below.headerY);
        expect(below.headerY).toBeLessThan(below.y0);
      }
    }
  });

  it('spends the band on cells unless they hit the size cap', () => {
    for (const { shapes, strips } of stacks()) {
      const { cell, x0, panes, bottom } = matrixStackLayout(shapes, strips, true);
      if (cell >= MAX_CELL - 1e-9) continue;
      const widest = Math.max(...shapes.map((shape) => shape.cols));
      const last = panes[panes.length - 1];
      const lastShape = shapes[shapes.length - 1];
      const fillsWidth = x0 + cell * widest >= VIEW_W - PAD_X - 1e-6;
      const fillsHeight =
        last !== undefined && lastShape !== undefined && last.y0 + cell * lastShape.rows + under(lastShape) >= bottom - 1e-6;
      expect(fillsWidth || fillsHeight).toBe(true);
    }
  });

  it('lays a single table out exactly as before', () => {
    const shape: MatrixShape = { ...pane(8, 7), strips: 1 };
    const single = matrixLayout(shape);
    const stack = matrixStackLayout([shape], 1, false);
    expect(single.cell).toBe(stack.cell);
    expect(single.y0).toBe(stack.panes[0]?.y0);
  });
});

describe('board layout', () => {
  it('fits every board size, with or without its search tree and strips, inside the canvas', () => {
    for (let size = 2; size <= 9; size++) {
      for (const strips of STRIP_COUNTS) {
        for (const withTree of [false, true]) {
          const { square, x0, y0, bottom, tree } = gridLayout(size, size, strips, withTree);
          const where = `${size}x${size}, ${strips} strips, tree ${withTree}`;
          expect(square, where).toBeGreaterThan(20);
          expect(square, where).toBeLessThanOrEqual(SQUARE_MAX);
          expect(x0, where).toBeGreaterThan(0);
          expect(y0 + size * square, where).toBeLessThanOrEqual(bottom);
          expect(bottom, where).toBeLessThanOrEqual(VIEW_H - strips * STRIP_HEIGHT);
          if (tree === null) {
            expect(x0 + size * square, where).toBeLessThanOrEqual(VIEW_W);
          } else {
            expect(x0 + size * square, where).toBeLessThanOrEqual(VIEW_W * BOARD_SHARE);
            expect(tree.x + tree.width, where).toBeLessThanOrEqual(VIEW_W);
          }
        }
      }
    }
  });
});
