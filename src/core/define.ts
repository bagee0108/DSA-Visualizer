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

export interface RegisteredAlgorithm {
  readonly meta: AlgorithmMeta;
  readonly fields: readonly FieldSpec[];
  readonly presets: readonly PresetSpec[];
  readonly sizeRange: { readonly min: number; readonly max: number; readonly step: number };
  readonly sizeOf: (params: ParamMap) => number;
  readonly defaults: ParamMap;
  readonly build: (params: ParamMap) => BuildResult;
  readonly codeLines: readonly string[];
}

export const MAX_FRAMES = 120000;

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
      const merged: Record<string, string> = { ...defaults, ...params };

      const parsed = def.parse(merged);
      if (!parsed.ok) return parsed;

      try {
        const frames: Frame[] = [];
        for (const frame of def.run(parsed.value)) {
          frames.push(frame);
          if (frames.length > MAX_FRAMES) {
            return {
              ok: false,
              error: `Run exceeded ${MAX_FRAMES.toLocaleString()} frames - try a smaller input.`,
            };
          }
        }
        if (frames.length === 0) return { ok: false, error: 'Algorithm produced no frames.' };
        return { ok: true, frames };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, error: `Generator threw: ${message}` };
      }
    },
  };
}
