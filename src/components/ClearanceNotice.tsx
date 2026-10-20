import { useMemo, type ReactNode } from 'react';

import type { Frame } from '../core/types';
import { clearanceNotice, clearanceOf } from '../renderers/graphClearance';
import { graphBandBottom, graphGeometry } from '../renderers/GraphRenderer';

export interface ClearanceNoticeProps {
  readonly frame: Frame | null;
}

/**
 * One line under the canvas when a graph, as drawn, has edges passing close to
 * nodes they don't join. Measured once per run, on the geometry the renderer
 * draws. The element stays mounted, empty when there is nothing to say, so a
 * screen reader hears the notice when a new graph brings one.
 */
export function ClearanceNotice({ frame }: ClearanceNoticeProps): ReactNode {
  const structure = frame?.structure;
  const graph = structure?.kind === 'graph' ? structure.graph : null;
  const strips = structure?.kind === 'graph' ? structure.strips.length : 0;
  const notice = useMemo(
    () => (graph === null ? null : clearanceNotice(clearanceOf(graphGeometry(graph, graphBandBottom(strips))))),
    [graph, strips],
  );

  return (
    <p role="status" className={notice === null ? 'shrink-0' : 'shrink-0 bg-ground px-3 pb-1.5 text-meta text-fg-dim'}>
      {notice}
    </p>
  );
}
