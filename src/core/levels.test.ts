import { describe, expect, it } from 'vitest';

import '../algorithms';
import { CATALOG } from '../catalog';
import { firstOpenLevel, isOpen, LEVELS, levelFor, neighbour, operations } from './levels';
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

describe('the ticker of operations', () => {
  const ops = operations();

  it('names each operation once', () => {
    const names = ops.map((op) => op.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('highlights only operations an available level shows', () => {
    for (const op of ops.filter((candidate) => candidate.available)) {
      const shownBy = LEVELS.filter((level) => isOpen(level) && level.ops.includes(op.name));
      expect(shownBy.length, `${op.name} is highlighted but no available level shows it`).toBeGreaterThan(0);
    }
  });

  it('highlights every operation an available level shows', () => {
    for (const level of LEVELS.filter(isOpen)) {
      for (const name of level.ops) {
        const op = ops.find((candidate) => candidate.name === name);
        expect(op?.available, `${level.id} shows ${name}, which is not highlighted`).toBe(true);
      }
    }
  });

  it('lists every operation any level shows, available or not', () => {
    const names = new Set(ops.map((op) => op.name));
    for (const level of LEVELS) for (const name of level.ops) expect(names.has(name), `${level.id}: ${name}`).toBe(true);
  });
});
