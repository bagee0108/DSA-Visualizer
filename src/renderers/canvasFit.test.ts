import { describe, expect, it } from 'vitest';

import { LAYOUT_ASPECT } from '../core/graphLayout';
import { arrayBands, FLOOR, INDEX_ROW_Y, POINTER_ROW_HEIGHT, POINTER_ROW_Y, type BandVariant } from './ArrayRenderer';
import { VIEW_H, VIEW_W } from './canvas';
import { graphBandBottom, graphBox, GRAPH_TOP } from './GraphRenderer';
import { matrixBandBottom, matrixLayout, MATRIX_TOP, MAX_CELL, type MatrixShape } from './MatrixRenderer';
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
