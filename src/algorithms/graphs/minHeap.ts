/** A binary min-heap of (key, node) entries whose array order the strip shows as-is. */

export interface HeapEntry {
  readonly key: number;
  readonly node: string;
  /** Unique per push, so a node pushed twice gets two chips. */
  readonly seq: number;
}

export class MinHeap {
  private readonly items: HeapEntry[] = [];
  private seq = 0;
  private swaps = 0;

  get size(): number {
    return this.items.length;
  }

  /** Heap-array order: the minimum first, then level by level. */
  get entries(): readonly HeapEntry[] {
    return this.items;
  }

  get swapCount(): number {
    return this.swaps;
  }

  peek(): HeapEntry | undefined {
    return this.items[0];
  }

  push(key: number, node: string): HeapEntry {
    const entry: HeapEntry = { key, node, seq: this.seq };
    this.seq += 1;
    this.items.push(entry);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
    return entry;
  }

  pop(): HeapEntry | undefined {
    const top = this.items[0];
    if (top === undefined) return undefined;
    const last = this.items.pop();
    if (last === undefined || this.items.length === 0) return top;
    this.items[0] = last;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < this.items.length && this.less(left, smallest)) smallest = left;
      if (right < this.items.length && this.less(right, smallest)) smallest = right;
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
    return top;
  }

  private less(a: number, b: number): boolean {
    const x = this.items[a];
    const y = this.items[b];
    if (x === undefined || y === undefined) return false;
    return x.key < y.key || (x.key === y.key && x.seq < y.seq);
  }

  private swap(a: number, b: number): void {
    const x = this.items[a];
    const y = this.items[b];
    if (x === undefined || y === undefined) return;
    this.items[a] = y;
    this.items[b] = x;
    this.swaps += 1;
  }
}
