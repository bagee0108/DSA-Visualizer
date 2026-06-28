/**
 * Shared input plumbing for array algorithms: one parser for user-typed
 * numbers, and the preset generators behind the "random / reversed / few
 * unique" buttons.
 */

import type { FieldSpec, ParamMap, ParseResult, PresetSpec } from './define';
import { makeRng, randomInt, shuffle } from './random';

export const MAX_ELEMENTS = 200;

export interface ParseNumbersOptions {
  readonly maxLength?: number;
  readonly minLength?: number;
  readonly label?: string;
}

export function parseNumberList(raw: string, options: ParseNumbersOptions = {}): ParseResult<number[]> {
  const label = options.label ?? 'Input';
  const maxLength = options.maxLength ?? MAX_ELEMENTS;
  const minLength = options.minLength ?? 1;

  const tokens = raw
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length < minLength) {
    return { ok: false, error: `${label} needs at least ${minLength} number(s).` };
  }
  if (tokens.length > maxLength) {
    return { ok: false, error: `${label} is capped at ${maxLength} elements (got ${tokens.length}).` };
  }

  const values: number[] = [];
  for (const token of tokens) {
    const value = Number(token);
    if (!Number.isFinite(value)) {
      return { ok: false, error: `"${token}" is not a number.` };
    }
    values.push(value);
  }
  return { ok: true, value: values };
}

export function formatNumberList(values: readonly number[]): string {
  return values.join(', ');
}

export const arrayField: FieldSpec = {
  key: 'input',
  label: 'Array',
  kind: 'numbers',
  defaultValue: '38, 12, 91, 5, 27, 64, 3, 70, 45, 19, 88, 52',
  placeholder: '38, 12, 91, 5, 27',
  help: `Comma or space separated. Up to ${MAX_ELEMENTS} values.`,
};

export const seedField: FieldSpec = {
  key: 'seed',
  label: 'Seed',
  kind: 'number',
  defaultValue: '1337',
  help: 'Presets are deterministic, so a seeded run can be bookmarked.',
  min: 0,
  max: 999999,
};

function toParams(values: readonly number[], seed: number): ParamMap {
  return { input: formatNumberList(values), seed: String(seed) };
}

function ramp(size: number): number[] {
  return Array.from({ length: size }, (_, index) => index + 1);
}

export const arrayPresets: readonly PresetSpec[] = [
  {
    id: 'random',
    label: 'Random',
    build: (size, rng) => toParams(shuffle(ramp(size), rng), randomInt(rng, 0, 999999)),
  },
  {
    id: 'sorted',
    label: 'Sorted',
    build: (size) => toParams(ramp(size), 0),
  },
  {
    id: 'reversed',
    label: 'Reversed',
    build: (size) => toParams(ramp(size).reverse(), 0),
  },
  {
    id: 'nearly',
    label: 'Nearly sorted',
    build: (size, rng) => {
      const values = ramp(size);
      const swapCount = Math.max(1, Math.round(size * 0.08));
      for (let k = 0; k < swapCount; k++) {
        const i = randomInt(rng, 0, size - 1);
        const j = Math.min(size - 1, i + randomInt(rng, 1, 3));
        const a = values[i];
        const b = values[j];
        if (a === undefined || b === undefined) continue;
        values[i] = b;
        values[j] = a;
      }
      return toParams(values, randomInt(rng, 0, 999999));
    },
  },
  {
    id: 'few-unique',
    label: 'Few unique',
    build: (size, rng) => {
      const buckets = Math.max(2, Math.round(Math.sqrt(size)));
      const step = Math.max(1, Math.floor(size / buckets));
      const values = Array.from({ length: size }, () => randomInt(rng, 1, buckets) * step);
      return toParams(values, randomInt(rng, 0, 999999));
    },
  },
  {
    id: 'organpipe',
    label: 'Organ pipe',
    build: (size) => {
      const values: number[] = [];
      for (let i = 0; i < size; i++) {
        values.push(i < size / 2 ? i + 1 : size - i);
      }
      return toParams(values, 0);
    },
  },
];

export function presetParams(presetId: string, size: number, seed: number): ParamMap {
  const preset = arrayPresets.find((candidate) => candidate.id === presetId) ?? arrayPresets[0];
  if (preset === undefined) return {};
  return preset.build(size, makeRng(seed));
}
