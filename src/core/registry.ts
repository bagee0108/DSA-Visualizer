/** The algorithm registry. */

import type { RegisteredAlgorithm } from './define';

const registry = new Map<string, RegisteredAlgorithm>();

export function register(algorithm: RegisteredAlgorithm): RegisteredAlgorithm {
  if (registry.has(algorithm.meta.id)) {
    throw new Error(`Duplicate algorithm id: ${algorithm.meta.id}`);
  }
  registry.set(algorithm.meta.id, algorithm);
  return algorithm;
}

export function getAlgorithm(id: string): RegisteredAlgorithm | undefined {
  return registry.get(id);
}

export function listAlgorithms(): readonly RegisteredAlgorithm[] {
  return [...registry.values()];
}

export function isRegistered(id: string): boolean {
  return registry.has(id);
}
