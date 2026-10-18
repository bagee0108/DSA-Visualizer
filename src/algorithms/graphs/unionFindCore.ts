/**
 * The disjoint-set forest behind Union-Find and Kruskal: parent and rank, the
 * parent arrows and rank labels on the canvas, and find with its frames. A
 * level keeps its own union frames and wording; merge() only decides and
 * applies which root goes under which, and says why.
 */

import type { GraphScene } from '../../core/graphScene';
import type { Frame, Strip } from '../../core/types';

export interface UnionFindLines {
  readonly findEnter: number;
  readonly climb: number;
  readonly findReturn: number;
  readonly compressSet: number;
  readonly shorter: number;
  readonly taller: number;
  readonly equal: number;
}

export interface UnionFindOptions {
  readonly byRank: boolean;
  readonly compress: boolean;
  readonly lines: UnionFindLines;
  readonly strips: () => readonly Strip[];
  /**
   * 'every-step' draws a frame per parent climbed and per pointer compressed.
   * 'one-per-find' draws one frame per find with the hops and compression
   * already done, for a level where finds are frequent but not the point.
   */
  readonly findFrames?: 'every-step' | 'one-per-find';
}

export interface Merge {
  /** The root that went under the other. */
  readonly child: string;
  readonly top: string;
  readonly line: number;
  readonly why: string;
}

export class DisjointSets {
  private readonly parent = new Map<string, string>();
  private readonly rank = new Map<string, number>();
  private count: number;

  constructor(
    private readonly scene: GraphScene,
    private readonly options: UnionFindOptions,
  ) {
    for (const id of scene.nodeIds) {
      this.parent.set(id, id);
      this.rank.set(id, 0);
      scene.setLabel(id, 'r0');
    }
    this.count = scene.nodeIds.length;
  }

  get sets(): number {
    return this.count;
  }

  get maxRank(): number {
    return Math.max(0, ...this.rank.values());
  }

  /** Climbs to x's root, compressing the path if enabled, yielding frames as configured. */
  *find(x: string, phase: string): Generator<Frame, string, undefined> {
    const { scene, options } = this;
    const { lines } = options;
    const stepFrames = (options.findFrames ?? 'every-step') === 'every-step';
    scene.countCall();
    scene.bump('finds');
    scene.pushCall({ label: `find(${scene.label(x)})`, codeLine: lines.findEnter });
    const path: string[] = [];
    let root = x;
    while (this.parent.get(root) !== root) {
      const next = this.parent.get(root) ?? root;
      scene.countComparison();
      scene.bump('parent hops');
      path.push(root);
      if (stepFrames) {
        yield scene.frame({
          codeLine: lines.climb,
          explanation: `find(${scene.label(x)}): ${scene.label(root)} is not its own parent, so climb to ${scene.label(next)}.`,
          highlights: { active: [root], candidate: [next, `link:${root}`], visited: [...path] },
          pointers: { x, root },
          strips: options.strips(),
          phase,
        });
      }
      root = next;
    }
    scene.countComparison();

    const compressed = options.compress && path.length > 1 ? path.slice(0, -1) : [];
    if (!stepFrames) {
      for (const node of compressed) this.pointAt(node, root);
      yield scene.frame({
        codeLine: lines.findReturn,
        explanation:
          path.length === 0
            ? `find(${scene.label(x)}) = ${scene.label(x)}: it is its own root.`
            : `find(${scene.label(x)}) = ${scene.label(root)}, ${path.length} hop${path.length === 1 ? '' : 's'} up${compressed.length === 0 ? '' : `; ${compressed.length} pointer${compressed.length === 1 ? '' : 's'} on the way now point straight at it`}.`,
        highlights: { pivot: [root], visited: [...path] },
        pointers: { x, root },
        strips: options.strips(),
        phase,
      });
      scene.popCall();
      return root;
    }

    yield scene.frame({
      codeLine: lines.findReturn,
      explanation:
        path.length === 0
          ? `find(${scene.label(x)}): ${scene.label(x)} is its own parent, so it is the root of its set.`
          : `${scene.label(root)} is its own parent: the root of ${scene.label(x)}'s set, ${path.length} hop${path.length === 1 ? '' : 's'} up.`,
      highlights: { pivot: [root], visited: [...path] },
      pointers: { x, root },
      strips: options.strips(),
      phase,
    });
    for (const node of compressed) {
      this.pointAt(node, root);
      yield scene.frame({
        codeLine: lines.compressSet,
        explanation: `Path compression: ${scene.label(node)} now points straight at ${scene.label(root)}, so the next find from here is one hop.`,
        highlights: { pivot: [root], candidate: [node, `link:${node}`], visited: [...path] },
        pointers: { x, root },
        strips: options.strips(),
        phase,
      });
    }
    scene.popCall();
    return root;
  }

  /** Puts one of two distinct roots under the other, by rank if enabled, and updates the canvas. No frame. */
  merge(ra: string, rb: string): Merge {
    const { scene, options } = this;
    const { lines } = options;
    const rankA = this.rank.get(ra) ?? 0;
    const rankB = this.rank.get(rb) ?? 0;
    let child = rb;
    let top = ra;
    let line = lines.equal;
    let why: string;
    if (!options.byRank) {
      why = `Naive union: ${scene.label(rb)} goes under ${scene.label(ra)} regardless of size, so trees can grow into chains.`;
    } else if (rankA < rankB) {
      scene.countComparison();
      child = ra;
      top = rb;
      line = lines.shorter;
      why = `rank ${rankA} < rank ${rankB}: the shorter tree at ${scene.label(ra)} goes under ${scene.label(rb)}, so no root's height grows.`;
    } else if (rankA > rankB) {
      scene.countComparison(2);
      line = lines.taller;
      why = `rank ${rankA} > rank ${rankB}: ${scene.label(rb)} goes under the taller root ${scene.label(ra)}, whose rank stays ${rankA}.`;
    } else {
      scene.countComparison(2);
      why = `equal ranks ${rankA}: ${scene.label(rb)} goes under ${scene.label(ra)}, and ${scene.label(ra)}'s rank rises to ${rankA + 1}, the only way a rank ever grows.`;
    }
    this.parent.set(child, top);
    scene.setLink(child, top);
    if (options.byRank && rankA === rankB) this.rank.set(top, rankA + 1);
    this.rootLabel(child);
    this.rootLabel(top);
    this.count -= 1;
    return { child, top, line, why };
  }

  private pointAt(node: string, root: string): void {
    this.scene.setLink(node, root);
    this.parent.set(node, root);
    this.scene.bump('pointers compressed');
  }

  private rootLabel(id: string): void {
    if (this.parent.get(id) === id) this.scene.setLabel(id, `r${this.rank.get(id) ?? 0}`);
    else this.scene.setLabel(id, null);
  }
}
