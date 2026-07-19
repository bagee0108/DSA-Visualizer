/** Renderer registry: one renderer per structure family. */

import type { ReactNode } from 'react';

import type { Frame } from '../core/types';
import { ArrayRenderer } from './ArrayRenderer';
import { TreeRenderer } from './TreeRenderer';

export interface StructureCanvasProps {
  readonly frame: Frame;
  readonly animate: boolean;
  readonly durationMs: number;
}

export function StructureCanvas({ frame, animate, durationMs }: StructureCanvasProps): ReactNode {
  switch (frame.structure.kind) {
    case 'array':
      return (
        <ArrayRenderer
          snapshot={frame.structure}
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
          highlights={frame.highlights}
          pointers={frame.pointers}
          animate={animate}
          durationMs={durationMs}
        />
      );
    default:
      return (
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          No renderer registered for this structure yet.
        </div>
      );
  }
}

export { ArrayRenderer } from './ArrayRenderer';
export { TreeRenderer } from './TreeRenderer';
