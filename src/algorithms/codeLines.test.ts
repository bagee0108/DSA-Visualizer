import { describe, expect, it } from 'vitest';
import type { RegisteredAlgorithm } from '../core/define';
import { listAlgorithms } from './index';
import { CODE_LINES, codeLineCases, lineTrace } from './codeLines.golden';

interface Summary {
  /** Case name to its trace, with each step mapped through the JS listing's map. */
  readonly traces: ReadonlyMap<string, string>;
  /** "case: step" for every step a frame or call names that the map does not have. */
  readonly unknown: readonly string[];
}

const summaries = new Map<string, Summary>();

/** Builds every case of a level once; both tests below read the result. */
function summary(algorithm: RegisteredAlgorithm): Summary {
  const cached = summaries.get(algorithm.meta.id);
  if (cached !== undefined) return cached;
  const known = (step: string): boolean => Object.hasOwn(algorithm.meta.stepLines, step);
  const traces = new Map<string, string>();
  const unknown = new Set<string>();
  for (const c of codeLineCases(algorithm)) {
    const built = algorithm.build(c.params);
    if (!built.ok) {
      traces.set(c.name, `error: ${built.error}`);
      continue;
    }
    for (const frame of built.frames) {
      for (const step of [frame.step, ...frame.callStack.map((entry) => entry.step ?? null)]) {
        if (step !== null && !known(step)) unknown.add(`${c.name}: ${step}`);
      }
    }
    traces.set(
      c.name,
      lineTrace(
        built.frames,
        (frame) => algorithm.lineOf(frame.step),
        (entry) => (entry.step === undefined ? undefined : algorithm.lineOf(entry.step)),
      ),
    );
  }
  const result = { traces, unknown: [...unknown] };
  summaries.set(algorithm.meta.id, result);
  return result;
}

describe('code lines', () => {
  it('has a recorded case table for every level, and every recorded level is registered', () => {
    expect(Object.keys(CODE_LINES).sort()).toEqual(listAlgorithms().map((algorithm) => algorithm.meta.id).sort());
  });

  for (const algorithm of listAlgorithms()) {
    it(`${algorithm.meta.id}: every step a frame or call names is in the JS code's map, for every case`, () => {
      expect(summary(algorithm).unknown).toEqual([]);
    });

    it(`${algorithm.meta.id}: mapping every frame's step through the JS map gives the line it was recorded on, for every case`, () => {
      const recorded = CODE_LINES[algorithm.meta.id] ?? {};
      const { traces } = summary(algorithm);
      expect([...traces.keys()]).toEqual(Object.keys(recorded));
      const changed = [...traces].filter(([name, trace]) => trace !== recorded[name]).map(([name]) => name);
      expect(changed).toEqual([]);
    });
  }
});
