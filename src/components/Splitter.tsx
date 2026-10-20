/**
 * A window splitter (WAI-ARIA "separator", focusable). One hairline of layout,
 * with a 24 px hit area laid over it: 16 px on the canvas's side, where the
 * drawing is letterboxed, and 8 px on the panel's. Dragging reports the
 * pointer's travel once per animation frame; keys map through keyAction(),
 * so the page decides what a step means. See CONTRIBUTING "Layout".
 */

import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

import { keyAction, type SeparatorValues, type SplitAction } from '../layout/panels';

export interface SplitterProps {
  readonly orientation: 'vertical' | 'horizontal';
  readonly label: string;
  /** Ids of the panes it sizes; only ids that are in the document. */
  readonly controls: string;
  readonly values: SeparatorValues;
  readonly valueText: string;
  readonly onAction: (action: SplitAction) => void;
  readonly onDragStart: () => void;
  /** Travel along the axis since the drag started, in CSS px; forwards (right, down) is positive. */
  readonly onDrag: (travel: number) => void;
  readonly onDragEnd: (travel: number) => void;
  /** Double-click: this splitter back to its default. */
  readonly onReset: () => void;
}

export function Splitter({ orientation, label, controls, values, valueText, onAction, onDragStart, onDrag, onDragEnd, onReset }: SplitterProps): ReactNode {
  const vertical = orientation === 'vertical';
  const drag = useRef<{ readonly id: number; readonly from: number; travel: number; frame: number } | null>(null);

  // A drag that outlives the component (a route change mid-drag) must not leave its frame queued.
  useEffect(() => () => {
    if (drag.current !== null) cancelAnimationFrame(drag.current.frame);
  }, []);

  const along = (event: PointerEvent<HTMLDivElement>): number => (vertical ? event.clientX : event.clientY);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    drag.current = { id: event.pointerId, from: along(event), travel: 0, frame: 0 };
    onDragStart();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const current = drag.current;
    if (current === null || current.id !== event.pointerId) return;
    current.travel = along(event) - current.from;
    if (current.frame !== 0) return;
    current.frame = requestAnimationFrame(() => {
      current.frame = 0;
      onDrag(current.travel);
    });
  };

  const finish = (event: PointerEvent<HTMLDivElement>): void => {
    const current = drag.current;
    if (current === null || current.id !== event.pointerId) return;
    cancelAnimationFrame(current.frame);
    drag.current = null;
    onDragEnd(current.travel);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const action = keyAction(event.key, event.shiftKey, orientation);
    const arrow = event.key.startsWith('Arrow');
    if (action === null && !arrow) return;
    // Handled here, so the page's playback shortcuts (arrows, Home, End) stay out of it.
    event.preventDefault();
    event.stopPropagation();
    if (action !== null) onAction(action);
  };

  return (
    <div className={`relative z-10 shrink-0 bg-line ${vertical ? 'w-px self-stretch' : 'h-px w-full'}`}>
      <div
        role="separator"
        tabIndex={0}
        aria-orientation={orientation}
        aria-label={label}
        aria-controls={controls}
        aria-valuenow={values.now}
        aria-valuemin={values.min}
        aria-valuemax={values.max}
        aria-valuetext={valueText}
        title={`${label}. Drag, or focus and use the arrow keys; Enter collapses or restores, double-click resets.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onDoubleClick={onReset}
        onKeyDown={onKeyDown}
        className={`group absolute touch-none outline-none ${vertical ? 'inset-y-0 -left-4 w-6 cursor-col-resize' : 'inset-x-0 -top-4 h-6 cursor-row-resize'}`}
      >
        {/* The line itself, thickened in the focus colour when focused or held; a grip marks where to take it. */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute bg-transparent group-hover:bg-edge group-focus-visible:bg-focus group-active:bg-focus ${
            vertical ? 'inset-y-0 left-[15px] w-[3px]' : 'inset-x-0 top-[15px] h-[3px]'
          }`}
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute rounded-full bg-edge group-hover:bg-fg-mute group-focus-visible:bg-focus group-active:bg-focus ${
            vertical ? 'top-1/2 left-[14px] h-7 w-[5px] -translate-y-1/2' : 'top-[14px] left-1/2 h-[5px] w-7 -translate-x-1/2'
          }`}
        />
      </div>
    </div>
  );
}
