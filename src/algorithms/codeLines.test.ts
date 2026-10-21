import { describe, expect, it } from 'vitest';
import { listAlgorithms } from './index';
import { CODE_LINES, codeLineCases, lineTrace } from './codeLines.golden';

describe('code lines', () => {
  it('has a recorded case table for every level, and every recorded level is registered', () => {
    expect(Object.keys(CODE_LINES).sort()).toEqual(listAlgorithms().map((algorithm) => algorithm.meta.id).sort());
  });

  for (const algorithm of listAlgorithms()) {
    it(`${algorithm.meta.id}: every frame is on the line it was recorded on, for every case`, () => {
      const recorded = CODE_LINES[algorithm.meta.id] ?? {};
      const cases = codeLineCases(algorithm);
      expect(cases.map((c) => c.name)).toEqual(Object.keys(recorded));
      const changed = cases
        .filter((c) => {
          const built = algorithm.build(c.params);
          const trace = built.ok ? lineTrace(built.frames, (frame) => frame.codeLine, (entry) => entry.codeLine) : `error: ${built.error}`;
          return trace !== recorded[c.name];
        })
        .map((c) => c.name);
      expect(changed).toEqual([]);
    });
  }
});
