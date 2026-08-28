/** Algorithm definition + type-erasure boundary. */

import type { Frame, FrameGenerator, StructureKind } from './types';

export type ParamMap = Readonly<Record<string, string>>;

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

export type Category =
  | 'sorting'
  | 'searching'
  | 'arrays'
  | 'trees'
  | 'graphs'
  | 'dynamic-programming'
  | 'strings'
  | 'backtracking';

export interface Complexity {
  readonly time: { readonly best: string; readonly average: string; readonly worst: string };
  readonly space: string;
  readonly notes?: readonly string[];
}

export type CounterKey =
  | 'comparisons'
  | 'swaps'
  | 'reads'
  | 'writes'
  | 'accesses'
  | 'recursiveCalls';

export interface AlgorithmMeta {
  readonly id: string;
  readonly name: string;
  readonly category: Category;
  readonly structureKind: StructureKind;
  readonly blurb: string;
  readonly complexity: Complexity;
  readonly code: string;
  readonly trackedCounters: readonly CounterKey[];
  readonly stable?: boolean;
  readonly inPlace?: boolean;
}

export type FieldKind = 'numbers' | 'number' | 'text' | 'select' | 'edges';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface FieldSpec {
  readonly key: string;
  readonly label: string;
  readonly kind: FieldKind;
  readonly defaultValue: string;
  readonly placeholder?: string;
  readonly help?: string;
  readonly options?: readonly SelectOption[];
  readonly min?: number;
  readonly max?: number;
}

export interface PresetSpec {
  readonly id: string;
  readonly label: string;
  readonly build: (size: number, rng: () => number) => ParamMap;
}

export interface AlgorithmDefinition<TInput> {
  readonly meta: AlgorithmMeta;
  readonly fields: readonly FieldSpec[];
  readonly parse: (params: ParamMap) => ParseResult<TInput>;
  /** The generator. Pure: no Math.random and no Date.now - seed via params. */
  readonly run: (input: TInput) => FrameGenerator;
  readonly presets?: readonly PresetSpec[];
  readonly sizeRange?: { readonly min: number; readonly max: number; readonly step: number };
  /** How big the current input is, for the preset size slider. Defaults to counting `input`. */
  readonly sizeOf?: (params: ParamMap) => number;
}

export type BuildResult =
  | { readonly ok: true; readonly frames: readonly Frame[] }
  | { readonly ok: false; readonly error: string };

export interface BuildStep {
  readonly done: boolean;
  readonly drained: number;
  /** Present exactly when done. */
  readonly result: BuildResult | null;
}

export interface IncrementalBuild {
  /** Drain until the budget is spent. `Infinity` drains to the end. */
  readonly step: (budgetMs: number) => BuildStep;
}

export interface RegisteredAlgorithm {
  readonly meta: AlgorithmMeta;
  readonly fields: readonly FieldSpec[];
  readonly presets: readonly PresetSpec[];
  readonly sizeRange: { readonly min: number; readonly max: number; readonly step: number };
  readonly sizeOf: (params: ParamMap) => number;
  readonly defaults: ParamMap;
  readonly build: (params: ParamMap) => BuildResult;
  /** The same build, drained a slice at a time. `build` is this run to the end. */
  readonly startBuild: (params: ParamMap) => IncrementalBuild;
  readonly codeLines: readonly string[];
}

export const MAX_FRAMES = 120000;

/** Frames drained between clock checks. Reading the clock per frame would cost
 *  more than the slice it is protecting. */
const CLOCK_EVERY = 16;

export function countTokens(value: string | undefined): number {
  if (value === undefined) return 0;
  return value.split(/[\s,;]+/).filter((token) => token.length > 0).length;
}

export function defineAlgorithm<TInput>(def: AlgorithmDefinition<TInput>): RegisteredAlgorithm {
  const defaults: Record<string, string> = {};
  for (const field of def.fields) defaults[field.key] = field.defaultValue;

  return {
    meta: def.meta,
    fields: def.fields,
    presets: def.presets ?? [],
    sizeRange: def.sizeRange ?? { min: 4, max: 200, step: 1 },
    sizeOf: def.sizeOf ?? ((params) => countTokens(params.input)),
    defaults,
    codeLines: def.meta.code.replace(/\s+$/, '').split('\n'),
    build(params: ParamMap): BuildResult {
      // One code path, so a chunked build and a synchronous one cannot drift.
      const step = startBuild(params).step(Number.POSITIVE_INFINITY);
      return step.result ?? { ok: false, error: 'Build did not finish.' };
    },
    startBuild,
  };

  function startBuild(params: ParamMap): IncrementalBuild {
    const merged: Record<string, string> = { ...defaults, ...params };
    const parsed = def.parse(merged);

    const frames: Frame[] = [];
    let iterator: Iterator<Frame> | null = null;
    let finished: BuildResult | null = parsed.ok ? null : parsed;
    if (parsed.ok) iterator = def.run(parsed.value)[Symbol.iterator]();

    const settle = (result: BuildResult): BuildStep => {
      finished = result;
      iterator?.return?.();
      iterator = null;
      return { done: true, drained: frames.length, result };
    };

    return {
      step(budgetMs: number): BuildStep {
        if (finished !== null) return { done: true, drained: frames.length, result: finished };

        const start = performance.now();
        try {
          for (;;) {
            const next = iterator?.next();
            if (next === undefined || next.done === true) {
              return settle(
                frames.length === 0
                  ? { ok: false, error: 'Algorithm produced no frames.' }
                  : { ok: true, frames },
              );
            }

            frames.push(next.value);
            if (frames.length > MAX_FRAMES) {
              return settle({
                ok: false,
                error: `Run exceeded ${MAX_FRAMES.toLocaleString()} frames - try a smaller input.`,
              });
            }

            if (frames.length % CLOCK_EVERY === 0 && performance.now() - start >= budgetMs) {
              return { done: false, drained: frames.length, result: null };
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return settle({ ok: false, error: `Generator threw: ${message}` });
        }
      },
    };
  }
}
