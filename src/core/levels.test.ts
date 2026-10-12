import { describe, expect, it } from 'vitest';

import '../algorithms';
import { CATALOG } from '../catalog';
import { firstOpenLevel, isOpen, LEVELS, levelFor, neighbour } from './levels';
import { listAlgorithms } from './registry';

describe('the learning path', () => {
  it('puts every catalog algorithm on the route exactly once', () => {
    const ids = LEVELS.map((level) => level.id);
    expect(new Set(ids).size, 'no level appears twice').toBe(ids.length);
    for (const entry of CATALOG) expect(ids, entry.id).toContain(entry.id);
  });

  it('has a place for every registered algorithm, so nothing built is unreachable', () => {
    for (const algorithm of listAlgorithms()) {
      expect(levelFor(algorithm.meta.id), algorithm.meta.id).toBeDefined();
    }
  });

  it('only adds race mode beyond the catalog', () => {
    const extra = LEVELS.filter((level) => level.entry === undefined).map((level) => level.id);
    expect(extra).toEqual(['race-mode']);
  });

  it('numbers levels 1..n in route order', () => {
    LEVELS.forEach((level, index) => expect(level.number).toBe(index + 1));
  });

  it('starts the path on an open level and steps between open levels only', () => {
    const first = firstOpenLevel();
    expect(first).toBeDefined();
    expect(first?.number).toBe(1);

    const avl = levelFor('avl');
    expect(avl).toBeDefined();
    if (avl === undefined) return;
    const previous = neighbour(avl, -1);
    const next = neighbour(avl, 1);
    expect(previous !== undefined && isOpen(previous)).toBe(true);
    expect(next !== undefined && isOpen(next)).toBe(true);
    expect(neighbour(LEVELS[LEVELS.length - 1]!, 1)).toBeUndefined();
  });
});
