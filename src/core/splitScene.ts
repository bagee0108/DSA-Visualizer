/**
 * SplitScene - the authoring surface for a run shown as several tables at
 * once, stacked: a DP table over its rolling row. Each pane is a MatrixScene
 * the generator drives as usual; a frame snapshots every pane together and
 * adds their counters, so the run's totals do not care how it is split.
 *
 * Highlights and pointers name a place in a pane with paneRef, which prefixes
 * a cellRef, rowRef or colRef with the pane's id.
 */

import type { MatrixScene } from './matrixScene';
import type { Counters, Frame, Highlights, MatrixArrow, Pointers, SplitPane, SplitSnapshot, Strip } from './types';

const NO_STRIPS: readonly Strip[] = Object.freeze([]);
const NO_POINTERS: Pointers = Object.freeze({});
const PANE_ID = /^[a-z][a-z0-9-]*$/;

export function paneRef(pane: string, ref: string): string {
  return `${pane}/${ref}`;
}

/** The inverse of paneRef; null for anything that is not one. */
export function parsePaneRef(ref: string): { readonly pane: string; readonly ref: string } | null {
  const slash = ref.indexOf('/');
  if (slash <= 0) return null;
  const pane = ref.slice(0, slash);
  return PANE_ID.test(pane) ? { pane, ref: ref.slice(slash + 1) } : null;
}

export interface SplitPaneSpec {
  /** Lowercase letters, digits and dashes, such as "table" or "row". */
  readonly id: string;
  readonly title: string;
  readonly scene: MatrixScene;
}

export interface SplitFrameInput {
  readonly explanation: string;
  readonly codeLine: number;
  readonly highlights?: Highlights;
  readonly pointers?: Pointers;
  /** Each pane's dependency arrows, by pane id. */
  readonly arrows?: Readonly<Record<string, readonly MatrixArrow[]>>;
  readonly strips?: readonly Strip[];
  readonly phase?: string;
}

function addCounters(panes: readonly SplitPaneSpec[]): Counters {
  const total = { comparisons: 0, swaps: 0, reads: 0, writes: 0, recursiveCalls: 0 };
  const extra: Record<string, number> = {};
  for (const { scene } of panes) {
    const counters = scene.counters();
    total.comparisons += counters.comparisons;
    total.swaps += counters.swaps;
    total.reads += counters.reads;
    total.writes += counters.writes;
    total.recursiveCalls += counters.recursiveCalls;
    for (const [key, value] of Object.entries(counters.extra)) extra[key] = (extra[key] ?? 0) + value;
  }
  return { ...total, extra };
}

export class SplitScene {
  private readonly panes: readonly SplitPaneSpec[];

  /** The first pane owns the call stack; the others are views of the same run. */
  constructor(panes: readonly SplitPaneSpec[]) {
    if (panes.length < 2) throw new RangeError('A split frame needs at least two panes');
    const ids = new Set<string>();
    for (const pane of panes) {
      if (!PANE_ID.test(pane.id)) throw new RangeError(`Pane id "${pane.id}" must be lowercase letters, digits and dashes`);
      if (ids.has(pane.id)) throw new RangeError(`Duplicate pane id "${pane.id}"`);
      ids.add(pane.id);
    }
    this.panes = Object.freeze([...panes]);
  }

  counters(): Counters {
    return addCounters(this.panes);
  }

  frame(input: SplitFrameInput): Frame {
    for (const id of Object.keys(input.arrows ?? {})) {
      if (!this.panes.some((pane) => pane.id === id)) throw new RangeError(`Arrows for unknown pane "${id}"`);
    }
    const panes: SplitPane[] = this.panes.map((pane) =>
      Object.freeze({ id: pane.id, title: pane.title, view: pane.scene.snapshot(input.arrows?.[pane.id]) }),
    );
    const structure: SplitSnapshot = {
      kind: 'split',
      panes: Object.freeze(panes),
      strips: input.strips ?? NO_STRIPS,
    };
    return {
      structure,
      highlights: input.highlights ?? {},
      pointers: input.pointers ?? NO_POINTERS,
      callStack: this.panes[0]?.scene.callStack() ?? [],
      explanation: input.explanation,
      codeLine: input.codeLine,
      counters: this.counters(),
      ...(input.phase === undefined ? {} : { phase: input.phase }),
    };
  }
}
