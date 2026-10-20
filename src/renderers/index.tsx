/** Renderer registry: one renderer per structure family. */

import { useMemo, type ReactNode } from 'react';

import type { Frame } from '../core/types';
import { ArrayRenderer } from './ArrayRenderer';
import { useInk } from './ink';
import { GraphRenderer } from './GraphRenderer';
import { GridRenderer } from './GridRenderer';
import { MatrixRenderer, SplitRenderer } from './MatrixRenderer';
import { TreeRenderer, treeRunBound } from './TreeRenderer';

export interface StructureCanvasProps {
  readonly frame: Frame;
  readonly frames: readonly Frame[];
  readonly animate: boolean;
  readonly durationMs: number;
  /** The page draws the strips in its own panel; renderers leave them out. */
  readonly stripsApart?: boolean;
}

export function StructureCanvas({ frame, frames, animate, durationMs, stripsApart = false }: StructureCanvasProps): ReactNode {
  const treeBound = useMemo(() => treeRunBound(frames), [frames]);
  const ink = useInk();

  switch (frame.structure.kind) {
    case 'array':
      return (
        <ArrayRenderer
          snapshot={frame.structure}
          ink={ink}
          highlights={frame.highlights}
          pointers={frame.pointers}
          animate={animate}
          durationMs={durationMs}
        />
      );
    case 'tree':
      return (
        <TreeRenderer
          snapshot={frame.structure}
          ink={ink}
          bound={treeBound}
          highlights={frame.highlights}
          pointers={frame.pointers}
          animate={animate}
          durationMs={durationMs}
          stripsApart={stripsApart}
        />
      );
    case 'graph':
      return (
        <GraphRenderer
          snapshot={frame.structure}
          ink={ink}
          highlights={frame.highlights}
          pointers={frame.pointers}
          animate={animate}
          durationMs={durationMs}
          stripsApart={stripsApart}
        />
      );
    case 'matrix':
      return (
        <MatrixRenderer
          snapshot={frame.structure}
          ink={ink}
          highlights={frame.highlights}
          pointers={frame.pointers}
          animate={animate}
          durationMs={durationMs}
          stripsApart={stripsApart}
        />
      );
    case 'split':
      return (
        <SplitRenderer
          snapshot={frame.structure}
          ink={ink}
          highlights={frame.highlights}
          pointers={frame.pointers}
          animate={animate}
          durationMs={durationMs}
          stripsApart={stripsApart}
        />
      );
    case 'grid':
      return (
        <GridRenderer
          snapshot={frame.structure}
          ink={ink}
          bound={treeBound}
          highlights={frame.highlights}
          pointers={frame.pointers}
          animate={animate}
          durationMs={durationMs}
          stripsApart={stripsApart}
        />
      );
    default:
      return (
        <div className="flex h-full items-center justify-center text-body text-fg-mute">
          No renderer registered for this structure yet.
        </div>
      );
  }
}

export { StripsPanel, stripsOf } from './StripsPanel';
export { ArrayRenderer } from './ArrayRenderer';
export { GraphRenderer } from './GraphRenderer';
export { GridRenderer } from './GridRenderer';
export { MatrixRenderer, SplitRenderer } from './MatrixRenderer';
export { TreeRenderer } from './TreeRenderer';
