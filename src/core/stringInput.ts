/**
 * Shared input plumbing for algorithms over two short strings, such as LCS
 * and edit distance: a parser, the size the preset slider reads, and random
 * strings for presets. Strings are capped so the table they span stays legible.
 */

import type { FieldSpec, ParamMap, ParseResult } from './define';
import { randomInt } from './random';

export const MAX_STRING = 12;

const CHARS = /^[A-Za-z0-9]+$/;

/** Whitespace is dropped, so "AB CB" and "ABCB" are the same input. */
export function parseString(raw: string, label: string, max = MAX_STRING): ParseResult<string> {
  const text = raw.replace(/\s+/g, '');
  if (text.length === 0) return { ok: false, error: `${label} needs at least one character.` };
  if (!CHARS.test(text)) return { ok: false, error: `${label} takes letters and digits only.` };
  if (text.length > max) return { ok: false, error: `${label} is capped at ${max} characters (got ${text.length}).` };
  return { ok: true, value: text };
}

export function stringField(key: string, label: string, defaultValue: string, max = MAX_STRING): FieldSpec {
  return {
    key,
    label,
    kind: 'text',
    defaultValue,
    placeholder: defaultValue,
    help: `Letters and digits, up to ${max}.`,
  };
}

/** The longer of the two strings, which is what the size slider moves. */
export function stringPairSize(params: ParamMap): number {
  return Math.max((params.a ?? '').replace(/\s+/g, '').length, (params.b ?? '').replace(/\s+/g, '').length);
}

export function randomString(rng: () => number, length: number, alphabet: string): string {
  let out = '';
  for (let at = 0; at < length; at++) out += alphabet[randomInt(rng, 0, alphabet.length - 1)] ?? '';
  return out;
}

/** A copy of the string with a few characters replaced, dropped or added. */
export function mutate(rng: () => number, text: string, edits: number, alphabet: string, max = MAX_STRING): string {
  let out = text;
  for (let edit = 0; edit < edits; edit++) {
    const at = randomInt(rng, 0, Math.max(0, out.length - 1));
    const kind = out.length <= 1 ? 2 : out.length >= max ? randomInt(rng, 0, 1) : randomInt(rng, 0, 2);
    const char = alphabet[randomInt(rng, 0, alphabet.length - 1)] ?? 'A';
    if (kind === 0) out = out.slice(0, at) + char + out.slice(at + 1);
    else if (kind === 1) out = out.slice(0, at) + out.slice(at + 1);
    else out = out.slice(0, at) + char + out.slice(at);
  }
  return out;
}
