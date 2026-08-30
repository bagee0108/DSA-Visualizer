import { describe, expect, it } from 'vitest';

import type { HighlightRole } from '../core/types';
import { circleMark, markFor, rectMark, resolveRoles } from './roles';

const ALL: readonly HighlightRole[] = [
  'comparing',
  'swapped',
  'pivot',
  'candidate',
  'sorted',
  'visited',
  'active',
  'excluded',
];

/**
 * The two pairs whose colours sit closest under deuteranopia in the shipped
 * palette. Exactly one member of each carries the mark, which is what keeps
 * the pair separable with colour removed.
 */
const TIGHT_PAIRS: ReadonlyArray<readonly [HighlightRole, HighlightRole]> = [
  ['pivot', 'active'],
  ['swapped', 'sorted'],
];

describe('role marks', () => {
  it('marks exactly one member of each tight pair', () => {
    for (const [a, b] of TIGHT_PAIRS) {
      const marked = [a, b].filter((role) => markFor(role) !== null);
      expect(marked, `${a} / ${b}`).toHaveLength(1);
    }
  });

  it('marks nothing else, so the mark stays meaningful', () => {
    const marked = ALL.filter((role) => markFor(role) !== null);
    expect(marked.sort()).toEqual(['pivot', 'swapped']);
    expect(markFor(undefined)).toBeNull();
  });

  it('tells the two marks apart', () => {
    expect(markFor('pivot')).toBe('solid');
    expect(markFor('swapped')).toBe('dashed');
    expect(circleMark('solid', 12).dash).toBeUndefined();
    expect(circleMark('dashed', 12).dash).toBeDefined();
  });

  it('leaves a rim of fill outside itself, at every radius the renderers use', () => {
    // 2.5 is the smallest heap node, 6.5 a 150-node graph, 17 the cap. Without
    // the rim the gaps in a dashed ring read as bites out of the node.
    for (let radius = 2.5; radius <= 17; radius += 0.25) {
      for (const mark of ['solid', 'dashed'] as const) {
        const stroke = circleMark(mark, radius);
        const outerEdge = stroke.radius + stroke.width / 2;
        expect(outerEdge, `radius ${radius}`).toBeLessThanOrEqual(radius - stroke.width * 0.4);
        expect(stroke.radius - stroke.width / 2, `radius ${radius}`).toBeGreaterThan(0);
        expect(stroke.width).toBeGreaterThanOrEqual(0.9);
      }
    }
  });

  it('divides the circle into a whole number of dashes, so the ring closes', () => {
    for (let radius = 2.5; radius <= 17; radius += 0.25) {
      const stroke = circleMark('dashed', radius);
      const [dash, gap] = (stroke.dash ?? '').split(' ').map(Number);
      const period = (dash ?? 0) + (gap ?? 0);
      const count = (2 * Math.PI * stroke.radius) / period;
      expect(count, `radius ${radius}`).toBeCloseTo(Math.round(count), 6);
      expect(Math.round(count), `radius ${radius}`).toBeGreaterThanOrEqual(4);
      expect(Math.round(count), `radius ${radius}`).toBeLessThanOrEqual(8);
      expect(gap, `radius ${radius} has a real gap`).toBeGreaterThan(0.8);
    }
  });

  it('stays visible as the node shrinks, so there is no size threshold', () => {
    for (const radius of [2.5, 5, 6.5, 8, 13, 17]) {
      expect(circleMark('solid', radius).width, `radius ${radius}`).toBeGreaterThanOrEqual(0.9);
    }
    expect(circleMark('solid', 17).width).toBeGreaterThan(circleMark('solid', 5).width);
  });

  it('skips shapes too small to hold a stroke', () => {
    expect(rectMark('solid', 4, 28)).toBeNull();
    expect(rectMark('solid', 40, 3)).toBeNull();
    expect(rectMark('solid', 40, 28)).not.toBeNull();
  });

  it('still resolves overlapping roles by priority', () => {
    const roles = resolveRoles({ pivot: [1], swapped: [1], sorted: [2] });
    expect(roles.get(1), 'swapped outranks pivot').toBe('swapped');
    expect(roles.get(2)).toBe('sorted');
  });
});
