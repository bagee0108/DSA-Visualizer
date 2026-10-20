/**
 * The visualize page's resizable layout: the canvas, the strips and
 * explanation under it, the transport, and the side panel (code, call stack,
 * counters, input). Two splitters, both sizing the canvas. See CONTRIBUTING
 * "Layout" and src/layout/panels.ts.
 *
 * Wide (900 px and up): the side panel sits right of a vertical splitter, and
 * a horizontal one divides the canvas from the strips and explanation. Below
 * that the panels stack, the page scrolls, and both splitters are horizontal
 * and set the canvas's height. The element tree is the same in both, so a
 * resize across the breakpoint keeps every measured node.
 *
 * The stylesheet enforces the limits (min/max sizes in CSS), so a window
 * resize can never squeeze the canvas past them; the code here only turns
 * keys and drags into sizes and reports aria values. While a splitter is held
 * its size is written straight to the element once per animation frame and
 * React hears of it only on release.
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';

import { Splitter } from '../components/Splitter';
import { Chip, ChipGroup } from '../components/ui';
import { useElementSize, useMediaQuery } from '../hooks/useElementSize';
import {
  aboveRange,
  besideRange,
  clampCanvas,
  DEFAULT_LAYOUT,
  isDefaultLayout,
  loadLayout,
  moveCanvas,
  saveLayout,
  separatorValues,
  STACK_BELOW,
  stackedRange,
  type CanvasRange,
  type PanelLayout,
  type SplitAction,
} from '../layout/panels';

export const CANVAS_ID = 'viz-canvas';
export const BOTTOM_ID = 'viz-bottom';
export const SIDE_ID = 'viz-side';

/** The shell's top bar; the stacked canvas is sized against the window under it. */
const VIEW = 'calc(100dvh - 2.75rem)';

export interface PanelLayoutProps {
  readonly header: ReactNode;
  readonly canvas: ReactNode;
  /** The frame's strips, or null when this run has none. */
  readonly strips: ReactNode;
  readonly hasStrips: boolean;
  /** The notice and the explanation, under the strips. */
  readonly commentary: ReactNode;
  /** Transport and status line; the status line takes the layout controls. */
  readonly transport: (controls: ReactNode) => ReactNode;
  readonly side: ReactNode;
}

type Which = 'beside' | 'above';

export function PanelLayout({ header, canvas, strips, hasStrips, commentary, transport, side }: PanelLayoutProps): ReactNode {
  const stacked = useMediaQuery(`(max-width: ${STACK_BELOW - 0.02}px)`);
  const [layout, setLayoutState] = useState<PanelLayout>(() => loadLayout());
  const setLayout = useCallback((next: PanelLayout) => {
    setLayoutState(next);
    saveLayout(next);
  }, []);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const regionRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const sideRef = useRef<HTMLElement | null>(null);

  const root = useElementSize(rootRef);
  const row = useElementSize(rowRef);
  const left = useElementSize(leftRef);
  const region = useElementSize(regionRef);
  const canvasBox = useElementSize(canvasRef);

  const stripsShown = hasStrips && !layout.stripsCollapsed;

  /**
   * The range and current canvas size each splitter works on, in this mode.
   * Totals leave out the splitter's own pixel. Only a collapsed side panel
   * beside the canvas leaves it everything; hidden strips still leave the
   * explanation, and stacked, the side panel was never beside it, so those
   * report what they measure.
   */
  const measure = (which: Which): { readonly range: CanvasRange; readonly canvas: number; readonly collapsed: boolean } => {
    const collapsed = !stacked && which === 'beside' && layout.sideCollapsed;
    if (stacked) return { range: stackedRange(root.height), canvas: canvasBox.height, collapsed };
    if (which === 'beside') return { range: besideRange(row.width - 1), canvas: left.width, collapsed };
    return { range: aboveRange(region.height - 1), canvas: canvasBox.height, collapsed };
  };

  /** The layout that gives the canvas this size, from this splitter. */
  const sized = (which: Which, base: PanelLayout, canvasPx: number, range: CanvasRange): PanelLayout => {
    const px = Math.round(clampCanvas(canvasPx, range));
    if (stacked) return which === 'beside' ? { ...base, stacked: px, sideCollapsed: false } : { ...base, stacked: px, stripsCollapsed: false };
    if (which === 'beside') return { ...base, side: Math.max(1, range.total - px), sideCollapsed: false };
    return { ...base, bottom: Math.max(1, range.total - px), stripsCollapsed: false };
  };

  /** The same size as sized(), written straight to the element during a drag. */
  const paint = (which: Which, canvasPx: number, range: CanvasRange): void => {
    const px = Math.round(clampCanvas(canvasPx, range));
    if (stacked) {
      if (canvasRef.current !== null) canvasRef.current.style.height = `${px}px`;
    } else if (which === 'beside') {
      if (sideRef.current !== null) sideRef.current.style.width = `${range.total - px}px`;
    } else if (bottomRef.current !== null) {
      bottomRef.current.style.height = `${range.total - px}px`;
    }
  };

  const act = (which: Which, action: SplitAction): void => {
    const { range, canvas: now, collapsed } = measure(which);
    if (action.kind === 'toggle') {
      setLayout(which === 'beside' ? { ...layout, sideCollapsed: !layout.sideCollapsed } : { ...layout, stripsCollapsed: !layout.stripsCollapsed });
      return;
    }
    // Moving a collapsed splitter opens its pane, starting from the canvas at its largest.
    const from = collapsed ? range.max : now;
    setLayout(sized(which, layout, moveCanvas(from, range, action), range));
  };

  const dragFrom = useRef<{ readonly which: Which; readonly start: number; readonly range: CanvasRange } | null>(null);
  const dragStart = (which: Which): void => {
    const { range, canvas: now, collapsed } = measure(which);
    const start = collapsed ? range.max : now;
    dragFrom.current = { which, start, range };
    rootRef.current?.setAttribute('data-resizing', '');
    if (collapsed) setLayout(sized(which, layout, start, range));
  };
  const dragMove = (which: Which, travel: number): void => {
    const from = dragFrom.current;
    if (from === null || from.which !== which) return;
    paint(which, from.start + travel, from.range);
  };
  const dragEnd = (which: Which, travel: number): void => {
    const from = dragFrom.current;
    dragFrom.current = null;
    rootRef.current?.removeAttribute('data-resizing');
    if (from === null || from.which !== which) return;
    setLayout(sized(which, layout, from.start + travel, from.range));
  };

  const resetOne = (which: Which): void => {
    if (stacked) setLayout(which === 'beside' ? { ...layout, stacked: null, sideCollapsed: false } : { ...layout, stacked: null, stripsCollapsed: false });
    else setLayout(which === 'beside' ? { ...layout, side: null, sideCollapsed: false } : { ...layout, bottom: null, stripsCollapsed: false });
  };

  const splitter = (which: Which): ReactNode => {
    const { range, canvas: now, collapsed } = measure(which);
    const values = separatorValues(now, range, collapsed);
    const axis = stacked || which === 'above' ? 'height' : 'width';
    const far = which === 'beside' ? `side panel ${layout.sideCollapsed ? 'collapsed' : 'open'}` : hasStrips ? `strips ${layout.stripsCollapsed ? 'hidden' : 'shown'}` : null;
    const of = stacked ? 'of the window height' : `of the ${axis}`;
    const controls = [CANVAS_ID, which === 'beside' ? (layout.sideCollapsed ? null : SIDE_ID) : BOTTOM_ID].filter((id) => id !== null).join(' ');
    return (
      <Splitter
        orientation={stacked || which === 'above' ? 'horizontal' : 'vertical'}
        label={which === 'beside' ? 'Resize the canvas and the side panel' : 'Resize the canvas and the strips and explanation'}
        controls={controls}
        values={values}
        valueText={`Canvas ${values.now}% ${of}${far === null ? '' : `, ${far}`}`}
        onAction={(action) => act(which, action)}
        onDragStart={() => dragStart(which)}
        onDrag={(travel) => dragMove(which, travel)}
        onDragEnd={(travel) => dragEnd(which, travel)}
        onReset={() => resetOne(which)}
      />
    );
  };

  const controls = (
    <ChipGroup label="Layout" className="shrink-0">
      <Chip pressed={!layout.sideCollapsed} onClick={() => setLayout({ ...layout, sideCollapsed: !layout.sideCollapsed })} title="Show or hide the code, counters and input">
        side panel
      </Chip>
      {hasStrips && (
        <Chip pressed={!layout.stripsCollapsed} onClick={() => setLayout({ ...layout, stripsCollapsed: !layout.stripsCollapsed })} title="Show or hide the queue, stack or output under the canvas">
          strips
        </Chip>
      )}
      <Chip onClick={() => setLayout(DEFAULT_LAYOUT)} disabled={isDefaultLayout(layout)} title="Every panel back to its default size, all shown">
        reset layout
      </Chip>
    </ChipGroup>
  );

  // Sizes the user chose; null leaves the stylesheet's default. The limits are always the stylesheet's.
  const canvasStyle = stacked ? { height: layout.stacked === null ? `clamp(calc(${VIEW} * 0.45), 62vw, ${VIEW})` : `${layout.stacked}px`, minHeight: `calc(${VIEW} * 0.45)`, maxHeight: VIEW } : undefined;
  const bottomStyle = !stacked && stripsShown && layout.bottom !== null ? { height: `${layout.bottom}px` } : undefined;
  const sideStyle = !stacked && layout.side !== null ? { width: `${layout.side}px` } : undefined;

  return (
    <div ref={rootRef} className={`panel-layout flex h-full min-h-0 flex-col overflow-x-clip ${stacked ? 'overflow-y-auto' : ''}`}>
      {header}
      <div ref={rowRef} className={stacked ? 'flex flex-col' : 'flex min-h-0 flex-1'}>
        <div ref={leftRef} className={stacked ? 'flex flex-col' : 'flex min-h-0 min-w-[40%] flex-1 flex-col'}>
          <div ref={regionRef} className={stacked ? 'flex flex-col' : 'flex min-h-0 flex-1 flex-col'}>
            <div ref={canvasRef} id={CANVAS_ID} className={stacked ? 'flex shrink-0 flex-col' : 'flex min-h-[45%] flex-1 basis-0 flex-col'} style={canvasStyle}>
              {canvas}
            </div>
            {splitter('above')}
            <div ref={bottomRef} id={BOTTOM_ID} className={`flex shrink-0 flex-col ${stacked ? '' : 'max-h-[55%] overflow-y-auto'}`} style={bottomStyle}>
              {stripsShown && strips}
              {commentary}
            </div>
          </div>
          {transport(controls)}
        </div>
        {splitter('beside')}
        {!layout.sideCollapsed && (
          <aside
            ref={sideRef}
            id={SIDE_ID}
            aria-label="Code, counters and input"
            className={stacked ? 'flex flex-col bg-panel' : 'flex w-[21rem] max-w-[60%] min-w-[272px] shrink-0 flex-col overflow-y-auto bg-panel xl:w-[23rem]'}
            style={sideStyle}
          >
            {side}
          </aside>
        )}
      </div>
    </div>
  );
}
