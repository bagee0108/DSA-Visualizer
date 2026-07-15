/** Shared assertions for the invariants the player and renderers depend on. */

import { expect } from 'vitest';

import type { ParamMap, RegisteredAlgorithm } from '../core/define';
import type { ArraySnapshot, Frame } from '../core/types';

export function runFrames(algorithm: RegisteredAlgorithm, params: ParamMap): readonly Frame[] {
  const result = algorithm.build(params);
  if (!result.ok) throw new Error(`${algorithm.meta.id} build failed: ${result.error}`);
  return result.frames;
}

export function lastFrame(frames: readonly Frame[]): Frame {
  const frame = frames[frames.length - 1];
  if (frame === undefined) throw new Error('no frames');
  return frame;
}

export function valuesOf(frame: Frame): number[] {
  const structure: ArraySnapshot = frame.structure;
  return structure.elements.map((element) => element.value);
}

export function idsOf(frame: Frame): number[] {
  const structure: ArraySnapshot = frame.structure;
  return structure.elements.map((element) => element.id);
}

export interface HygieneOptions {
  readonly allowNonEmptyFinalStack?: boolean;
}

export function expectFrameHygiene(
  algorithm: RegisteredAlgorithm,
  frames: readonly Frame[],
  options: HygieneOptions = {},
): void {
  expect(frames.length).toBeGreaterThan(0);

  const codeLineCount = algorithm.codeLines.length;
  const size = frames[0]?.structure.elements.length ?? 0;

  let previous: Frame | null = null;
  for (const [position, frame] of frames.entries()) {
    const where = `${algorithm.meta.id} frame ${position}`;

    expect(frame.codeLine, `${where}: codeLine`).toBeGreaterThanOrEqual(0);
    expect(frame.codeLine, `${where}: codeLine`).toBeLessThanOrEqual(codeLineCount);

    expect(frame.explanation.trim().length, `${where}: explanation`).toBeGreaterThan(0);

    expect(frame.structure.elements.length, `${where}: size`).toBe(size);

    // Snapshots are frozen, so a renderer cannot corrupt playback.
    expect(Object.isFrozen(frame.structure.elements), `${where}: frozen`).toBe(true);

    for (const [label, index] of Object.entries(frame.pointers)) {
      expect(index, `${where}: pointer ${label}`).toBeGreaterThanOrEqual(-1);
      expect(index, `${where}: pointer ${label}`).toBeLessThanOrEqual(size);
    }

    for (const [role, ids] of Object.entries(frame.highlights)) {
      for (const id of ids ?? []) {
        if (typeof id === 'number') {
          expect(id, `${where}: highlight ${role}`).toBeGreaterThanOrEqual(0);
          expect(id, `${where}: highlight ${role}`).toBeLessThan(size);
        } else {
          const match = /^aux:(\d+)$/.exec(id);
          expect(match, `${where}: highlight ${role} id "${id}"`).not.toBeNull();
          expect(Number(match?.[1] ?? -1), `${where}: aux highlight`).toBeLessThan(size);
        }
      }
    }

    for (const region of frame.structure.regions) {
      expect(region.from, `${where}: region ${region.label}`).toBeGreaterThanOrEqual(0);
      expect(region.to, `${where}: region ${region.label}`).toBeLessThan(size);
      expect(region.from, `${where}: region ${region.label}`).toBeLessThanOrEqual(region.to);
    }

    const aux = frame.structure.auxiliary;
    if (aux !== undefined) {
      expect(aux.activeFrom, `${where}: aux from`).toBeGreaterThanOrEqual(0);
      expect(aux.activeTo, `${where}: aux to`).toBeLessThan(size);
      expect(aux.elements.length, `${where}: aux size`).toBe(size);
    }

    const heap = frame.structure.heap;
    if (heap !== undefined) {
      expect(heap.size, `${where}: heap size`).toBeGreaterThanOrEqual(0);
      expect(heap.size, `${where}: heap size`).toBeLessThanOrEqual(size);
    }

    expect(frame.callStack.length, `${where}: stack depth`).toBeLessThan(64);

    if (previous !== null) {
      expect(frame.counters.comparisons, `${where}: comparisons`).toBeGreaterThanOrEqual(
        previous.counters.comparisons,
      );
      expect(frame.counters.swaps, `${where}: swaps`).toBeGreaterThanOrEqual(previous.counters.swaps);
      expect(frame.counters.reads, `${where}: reads`).toBeGreaterThanOrEqual(previous.counters.reads);
      expect(frame.counters.writes, `${where}: writes`).toBeGreaterThanOrEqual(previous.counters.writes);
      expect(frame.counters.recursiveCalls, `${where}: calls`).toBeGreaterThanOrEqual(
        previous.counters.recursiveCalls,
      );
    }
    previous = frame;
  }

  if (options.allowNonEmptyFinalStack !== true) {
    expect(lastFrame(frames).callStack, `${algorithm.meta.id}: final stack`).toHaveLength(0);
  }
}

export function expectDeterministic(algorithm: RegisteredAlgorithm, params: ParamMap): void {
  const a = runFrames(algorithm, params);
  const b = runFrames(algorithm, params);
  expect(a.length).toBe(b.length);
  expect(a.map(valuesOf)).toEqual(b.map(valuesOf));
  expect(a.map((frame) => frame.explanation)).toEqual(b.map((frame) => frame.explanation));
  expect(a.map((frame) => frame.codeLine)).toEqual(b.map((frame) => frame.codeLine));
}

export function expectInputContract(algorithm: RegisteredAlgorithm): void {
  for (const field of algorithm.fields) {
    expect(algorithm.defaults[field.key], `${algorithm.meta.id}: default ${field.key}`).toBe(
      field.defaultValue,
    );
    if (field.kind === 'select') {
      const options = field.options ?? [];
      expect(options.length, `${algorithm.meta.id}: ${field.key} options`).toBeGreaterThan(0);
      expect(options.some((option) => option.value === field.defaultValue)).toBe(true);
    }
  }
  expect(algorithm.build({}).ok, `${algorithm.meta.id}: defaults must run`).toBe(true);
}
