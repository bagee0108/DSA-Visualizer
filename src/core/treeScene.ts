/** TreeScene - the authoring surface for tree algorithms, mirroring ArrayScene. */

import type {
  CallStackEntry,
  Counters,
  Frame,
  Highlights,
  NodeColor,
  Pointers,
  TreeNodeSnapshot,
  TreeSnapshot,
  TreeStrip,
} from './types';

const NO_STRIPS: readonly TreeStrip[] = Object.freeze([]);
const NO_STACK: readonly CallStackEntry[] = Object.freeze([]);
const NO_POINTERS: Pointers = Object.freeze({});

export type Arity = 'binary' | 'nary';
export const LEFT = 0;
export const RIGHT = 1;
export type Side = typeof LEFT | typeof RIGHT;

interface MutableNode {
  readonly id: string;
  label: string;
  value: number;
  parentId: string | null;
  children: (string | null)[];
  badges: Record<string, string | number> | null;
  color: NodeColor | null;
  terminal: boolean;
}

export interface NodeView {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly parentId: string | null;
  readonly children: readonly (string | null)[];
  readonly color: NodeColor | null;
  readonly terminal: boolean;
}

export interface CreateOptions {
  readonly value?: number;
  readonly color?: NodeColor;
  readonly badges?: Record<string, string | number>;
  readonly terminal?: boolean;
}

export interface TreeFrameInput {
  readonly explanation: string;
  readonly codeLine: number;
  readonly highlights?: Highlights;
  readonly pointers?: Pointers;
  readonly strips?: readonly TreeStrip[];
  readonly phase?: string;
}

export class TreeScene {
  private readonly nodes = new Map<string, MutableNode>();
  private rootId: string | null = null;
  private nextId = 0;
  private readonly arity: Arity;

  private readonly stack: CallStackEntry[] = [];
  private comparisons = 0;
  private reads = 0;
  private writes = 0;
  private recursiveCalls = 0;
  private readonly extra: Record<string, number> = {};

  private snapshotCache: readonly TreeNodeSnapshot[] | null = null;
  private stackCache: readonly CallStackEntry[] | null = null;

  constructor(arity: Arity) {
    this.arity = arity;
  }

  get root(): string | null {
    return this.rootId;
  }

  get size(): number {
    return this.nodes.size;
  }

  setRoot(id: string | null): void {
    if (id !== null) this.must(id).parentId = null;
    this.rootId = id;
    this.writes += 1;
    this.snapshotCache = null;
  }

  create(label: string, options: CreateOptions = {}): string {
    const id = `n${this.nextId}`;
    this.nextId += 1;
    this.nodes.set(id, {
      id,
      label,
      value: options.value ?? Number.NaN,
      parentId: null,
      children: this.arity === 'binary' ? [null, null] : [],
      badges: options.badges === undefined ? null : { ...options.badges },
      color: options.color ?? null,
      terminal: options.terminal ?? false,
    });
    this.writes += 1;
    this.snapshotCache = null;
    return id;
  }

  has(id: string): boolean {
    return this.nodes.has(id);
  }

  get(id: string): NodeView {
    const node = this.must(id);
    return {
      id: node.id,
      label: node.label,
      value: node.value,
      parentId: node.parentId,
      children: node.children,
      color: node.color,
      terminal: node.terminal,
    };
  }

  parent(id: string): string | null {
    return this.must(id).parentId;
  }

  child(id: string, side: Side): string | null {
    return this.must(id).children[side] ?? null;
  }

  left(id: string): string | null {
    return this.child(id, LEFT);
  }

  right(id: string): string | null {
    return this.child(id, RIGHT);
  }

  children(id: string): readonly string[] {
    return this.must(id).children.filter((child): child is string => child !== null);
  }

  sideOf(id: string): Side | null {
    const parentId = this.must(id).parentId;
    if (parentId === null) return null;
    return this.must(parentId).children[LEFT] === id ? LEFT : RIGHT;
  }

  link(parentId: string, side: Side, childId: string | null): void {
    const parent = this.must(parentId);
    const previous = parent.children[side];
    if (previous !== null && previous !== undefined) {
      const orphan = this.nodes.get(previous);
      if (orphan !== undefined && orphan.parentId === parentId) orphan.parentId = null;
    }
    parent.children[side] = childId;
    if (childId !== null) {
      const child = this.must(childId);
      child.parentId = parentId;
    }
    this.writes += 1;
    this.snapshotCache = null;
  }

  replaceChild(oldChild: string, newChild: string | null): void {
    const parentId = this.must(oldChild).parentId;
    if (parentId === null) {
      this.setRoot(newChild);
      this.must(oldChild).parentId = null;
      return;
    }
    const side = this.sideOf(oldChild);
    if (side === null) return;
    this.link(parentId, side, newChild);
  }

  rotate(x: string, direction: 'left' | 'right'): { readonly y: string; readonly crossing: string | null } {
    const towards: Side = direction === 'left' ? RIGHT : LEFT;
    const away: Side = direction === 'left' ? LEFT : RIGHT;
    const y = this.child(x, towards);
    if (y === null) throw new Error(`rotate ${direction} at ${x}: no child to lift`);
    const crossing = this.child(y, away);
    const parent = this.parent(x);
    const side = this.sideOf(x);

    this.link(x, towards, crossing);
    this.link(y, away, x);
    if (parent === null || side === null) this.setRoot(y);
    else this.link(parent, side, y);
    this.bump('rotations');
    return { y, crossing };
  }

  attach(parentId: string, childId: string): void {
    const parent = this.must(parentId);
    const child = this.must(childId);
    child.parentId = parentId;
    parent.children.push(childId);
    parent.children.sort((a, b) => {
      const la = a === null ? '' : this.must(a).label;
      const lb = b === null ? '' : this.must(b).label;
      return la < lb ? -1 : la > lb ? 1 : 0;
    });
    this.writes += 1;
    this.snapshotCache = null;
  }

  destroy(id: string): void {
    const node = this.must(id);
    if (node.children.some((child) => child !== null)) {
      throw new Error(`destroy(${id}): node still has children`);
    }
    if (node.parentId !== null) {
      const parent = this.must(node.parentId);
      parent.children = parent.children.map((child) => (child === id ? (this.arity === 'binary' ? null : child) : child));
      if (this.arity === 'nary') parent.children = parent.children.filter((child) => child !== id);
    }
    if (this.rootId === id) this.rootId = null;
    this.nodes.delete(id);
    this.writes += 1;
    this.snapshotCache = null;
  }

  value(id: string): number {
    return this.must(id).value;
  }

  label(id: string): string {
    return this.must(id).label;
  }

  setValue(id: string, value: number, label = String(value)): void {
    const node = this.must(id);
    node.value = value;
    node.label = label;
    this.writes += 1;
    this.snapshotCache = null;
  }

  setBadges(id: string, badges: Record<string, string | number> | null): void {
    this.must(id).badges = badges === null ? null : { ...badges };
    this.snapshotCache = null;
  }

  setColor(id: string, color: NodeColor): void {
    this.must(id).color = color;
    this.writes += 1;
    this.snapshotCache = null;
  }

  color(id: string): NodeColor | null {
    return this.must(id).color;
  }

  setTerminal(id: string, terminal: boolean): void {
    this.must(id).terminal = terminal;
    this.writes += 1;
    this.snapshotCache = null;
  }

  visit(id: string): NodeView {
    this.reads += 1;
    return this.get(id);
  }

  compareValue(id: string, value: number): number {
    this.comparisons += 1;
    this.reads += 1;
    const key = this.must(id).value;
    return key < value ? -1 : key > value ? 1 : 0;
  }

  compare(a: string, b: string): number {
    this.comparisons += 1;
    this.reads += 2;
    const x = this.must(a).value;
    const y = this.must(b).value;
    return x < y ? -1 : x > y ? 1 : 0;
  }

  countComparison(count = 1): void {
    this.comparisons += count;
  }

  countCall(): void {
    this.recursiveCalls += 1;
  }

  bump(key: string, by = 1): void {
    this.extra[key] = (this.extra[key] ?? 0) + by;
  }

  pushCall(entry: CallStackEntry): void {
    this.stack.push(entry);
    this.stackCache = null;
  }

  popCall(): void {
    this.stack.pop();
    this.stackCache = null;
  }

  get depth(): number {
    return this.stack.length;
  }

  counters(): Counters {
    return {
      comparisons: this.comparisons,
      swaps: 0,
      reads: this.reads,
      writes: this.writes,
      recursiveCalls: this.recursiveCalls,
      extra: { ...this.extra },
    };
  }

  inorder(): number[] {
    const out: number[] = [];
    const walk = (id: string | null): void => {
      if (id === null) return;
      const node = this.must(id);
      walk(node.children[LEFT] ?? null);
      out.push(node.value);
      walk(node.children[RIGHT] ?? null);
    };
    walk(this.rootId);
    return out;
  }

  height(id: string | null): number {
    if (id === null) return -1;
    const node = this.must(id);
    let best = -1;
    for (const child of node.children) best = Math.max(best, this.height(child));
    return best + 1;
  }

  subtree(id: string | null): string[] {
    if (id === null) return [];
    const out: string[] = [];
    const walk = (current: string): void => {
      out.push(current);
      for (const child of this.must(current).children) if (child !== null) walk(child);
    };
    walk(id);
    return out;
  }

  private must(id: string): MutableNode {
    const node = this.nodes.get(id);
    if (node === undefined) throw new Error(`Unknown node ${id}`);
    return node;
  }

  private snapshotNodes(): readonly TreeNodeSnapshot[] {
    if (this.snapshotCache === null) {
      const out: TreeNodeSnapshot[] = [];
      for (const node of this.nodes.values()) {
        out.push({
          id: node.id,
          label: node.label,
          parentId: node.parentId,
          children: Object.freeze([...node.children]),
          ...(node.badges === null ? {} : { badges: { ...node.badges } }),
          ...(node.color === null ? {} : { color: node.color }),
          ...(node.terminal ? { terminal: true } : {}),
        });
      }
      this.snapshotCache = Object.freeze(out);
    }
    return this.snapshotCache;
  }

  private stackSnapshot(): readonly CallStackEntry[] {
    if (this.stack.length === 0) return NO_STACK;
    if (this.stackCache === null) this.stackCache = Object.freeze([...this.stack]);
    return this.stackCache;
  }

  frame(input: TreeFrameInput): Frame {
    const structure: TreeSnapshot = {
      kind: 'tree',
      arity: this.arity,
      rootId: this.rootId,
      nodes: this.snapshotNodes(),
      strips: input.strips ?? NO_STRIPS,
    };
    return {
      structure,
      highlights: input.highlights ?? {},
      pointers: input.pointers ?? NO_POINTERS,
      callStack: this.stackSnapshot(),
      explanation: input.explanation,
      codeLine: input.codeLine,
      counters: this.counters(),
      ...(input.phase === undefined ? {} : { phase: input.phase }),
    };
  }
}
