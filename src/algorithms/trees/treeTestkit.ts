/** Test-only helpers for the tree family. */

import type { Frame, TreeNodeSnapshot, TreeSnapshot } from '../../core/types';
import { treeOf } from '../frameHygiene';

export function nodeMap(tree: TreeSnapshot): ReadonlyMap<string, TreeNodeSnapshot> {
  return new Map(tree.nodes.map((node) => [node.id, node] as const));
}

export function inorderKeys(tree: TreeSnapshot): number[] {
  const byId = nodeMap(tree);
  const out: number[] = [];
  const walk = (id: string | null): void => {
    if (id === null) return;
    const node = byId.get(id);
    if (node === undefined) return;
    walk(node.children[0] ?? null);
    out.push(Number(node.label));
    walk(node.children[1] ?? null);
  };
  walk(tree.rootId);
  return out;
}

export function isBst(tree: TreeSnapshot): boolean {
  const byId = nodeMap(tree);
  const check = (id: string | null, low: number, high: number): boolean => {
    if (id === null) return true;
    const node = byId.get(id);
    if (node === undefined) return false;
    const key = Number(node.label);
    if (!(key > low && key < high)) return false;
    return check(node.children[0] ?? null, low, key) && check(node.children[1] ?? null, key, high);
  };
  return check(tree.rootId, -Infinity, Infinity);
}

export function treeHeight(tree: TreeSnapshot): number {
  const byId = nodeMap(tree);
  const height = (id: string | null): number => {
    if (id === null) return 0;
    const node = byId.get(id);
    if (node === undefined) return 0;
    return 1 + Math.max(...node.children.map((child) => height(child ?? null)));
  };
  return height(tree.rootId);
}

export function isAvl(tree: TreeSnapshot): boolean {
  const byId = nodeMap(tree);
  let ok = true;
  const height = (id: string | null): number => {
    if (id === null) return 0;
    const node = byId.get(id);
    if (node === undefined) return 0;
    const l = height(node.children[0] ?? null);
    const r = height(node.children[1] ?? null);
    if (Math.abs(l - r) > 1) ok = false;
    return 1 + Math.max(l, r);
  };
  height(tree.rootId);
  return ok;
}

export function redBlackViolation(tree: TreeSnapshot): string | null {
  const byId = nodeMap(tree);
  if (tree.rootId === null) return null;
  const root = byId.get(tree.rootId);
  if (root?.color !== 'black') return 'root is not black';

  let violation: string | null = null;
  const blackHeight = (id: string | null): number => {
    if (id === null) return 1;
    const node = byId.get(id);
    if (node === undefined) return 1;
    if (node.color === undefined) violation ??= `node ${node.label} has no colour`;
    if (node.color === 'red') {
      for (const child of node.children) {
        if (child !== null && byId.get(child)?.color === 'red') violation ??= `red ${node.label} has red child`;
      }
    }
    const l = blackHeight(node.children[0] ?? null);
    const r = blackHeight(node.children[1] ?? null);
    if (l !== r) violation ??= `black heights differ under ${node.label} (${l} vs ${r})`;
    return l + (node.color === 'black' ? 1 : 0);
  };
  blackHeight(tree.rootId);
  return violation;
}

export function settledFrames(frames: readonly Frame[]): readonly Frame[] {
  return frames.filter((frame) => frame.callStack.length === 0 && frame.structure.kind === 'tree');
}

export function outputLabels(frame: Frame, label = 'output'): string[] {
  const strip = treeOf(frame).strips.find((candidate) => candidate.label === label);
  return (strip?.items ?? []).map((item) => item.label);
}
