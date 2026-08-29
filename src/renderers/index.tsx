/** Renderer registry: one renderer per structure family. */

import { useMemo, type ReactNode } from 'react';

import type { Frame } from '../core/types';
import { ArrayRenderer } from './ArrayRenderer';
import { useInk } from './ink';
import { GraphRenderer } from './GraphRenderer';
import { TreeRenderer, treeRunBound } from './TreeRenderer';

export interface StructureCanvasProps {
  readonly frame: Frame;
  readonly frames: readonly Frame[];
  readonly animate: boolean;
  readonly durationMs: number;
}

export function StructureCanvas({ frame, frames, animate, durationMs }: StructureCanvasProps): ReactNode {
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

export { ArrayRenderer } from './ArrayRenderer';
export { GraphRenderer } from './GraphRenderer';
export { TreeRenderer } from './TreeRenderer';
