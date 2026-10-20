/**
 * The graph editor, drawn in place of the canvas on graph levels while the
 * playback machine is in `editing`. Every pointer action has a keyboard
 * equivalent; every edit is a new immutable snapshot (src/core/graphEdit.ts),
 * so undo and redo are a walk along the history. See CONTRIBUTING "Graphs".
 *
 * Pointer, by tool: select/move drags a node and selects what it clicks; add
 * node puts one where it clicks; add edge drags (or clicks) from one node to
 * another; delete removes what it clicks. In any tool a double-click on an edge
 * edits its weight, and Delete removes the selection.
 *
 * Keys: Tab walks the nodes in id order, then the edges. N adds a node at a
 * free spot. E on a node starts an edge: Tab to the target and press Enter (or
 * E). Arrows move the selected node (Shift: further). Enter on an edge edits its
 * weight. Delete or Backspace removes. Ctrl+Z undoes, Ctrl+Y or Ctrl+Shift+Z
 * redoes. Escape cancels whatever is half done.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

import {
  addEdge,
  addNode,
  commit,
  editorDrawing,
  freeSpot,
  moveNode,
  redo,
  removeEdge,
  removeNode,
  setDirected,
  setWeight,
  startHistory,
  undo,
  type EditorGraph,
  type EditResult,
  type History,
} from '../core/graphEdit';
import type { Point } from '../core/graphLayout';
import { VIEW_W } from '../renderers/canvas';
import { graphBandBottom, graphBox, graphGeometry } from '../renderers/GraphRenderer';
import { useInk } from '../renderers/ink';
import { bandHeight } from '../renderers/strips';
import { Button, Chip, ChipGroup } from './ui';

export type EditTool = 'select' | 'node' | 'edge' | 'delete';

const TOOLS: ReadonlyArray<readonly [EditTool, string, string]> = [
  ['select', 'select / move', 'Drag a node to move it; click to select'],
  ['node', 'add node', 'Click empty space to add a node'],
  ['edge', 'add edge', 'Drag from one node to another, or click one and then the other'],
  ['delete', 'delete', 'Click a node or an edge to remove it'],
];

/** Arrow-key moves, in view units. */
const NUDGE = 8;
const NUDGE_BIG = 32;
/** Pointer travel, in CSS px, before a press on a node counts as a drag. */
const DRAG_SLOP = 4;

type Selection = { readonly kind: 'node'; readonly id: number } | { readonly kind: 'edge'; readonly index: number } | null;

interface Press {
  readonly pointer: number;
  readonly node: number;
  readonly startX: number;
  readonly startY: number;
  moved: boolean;
}

export interface GraphEditorProps {
  readonly initial: EditorGraph;
  /** Strip rows the level draws, so the editor's band and scale match the run's canvas. */
  readonly strips: number;
  readonly onChange: (graph: EditorGraph) => void;
  readonly onDone: () => void;
}

export function GraphEditor({ initial, strips, onChange, onDone }: GraphEditorProps): ReactNode {
  const [history, setHistory] = useState<History>(() => startHistory(initial));
  const [tool, setTool] = useState<EditTool>('select');
  const [selected, setSelected] = useState<Selection>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [said, setSaid] = useState('Editing. The run comes back when you press Done.');
  const [preview, setPreview] = useState<EditorGraph | null>(null);
  const [rubber, setRubber] = useState<{ readonly from: number; readonly to: Point } | null>(null);
  const [weightOf, setWeightOf] = useState<{ readonly index: number; readonly draft: string } | null>(null);
  const [focusNext, setFocusNext] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const press = useRef<Press | null>(null);
  const ink = useInk();

  const graph = preview ?? history.present;
  const bottom = graphBandBottom(strips);
  const box = graphBox(bottom);
  const drawing = useMemo(() => editorDrawing(graph), [graph]);
  const geometry = useMemo(() => graphGeometry(drawing, bottom), [drawing, bottom]);
  const { radius } = geometry;

  // Every committed edit goes out: the edge-list field, the URL and the clearance notice follow it.
  const sent = useRef(history.present);
  useEffect(() => {
    if (sent.current === history.present) return;
    sent.current = history.present;
    onChange(history.present);
  }, [history.present, onChange]);

  // Focus follows an edit that made or renumbered the thing in hand.
  useEffect(() => {
    if (focusNext === null) return;
    const target = svgRef.current?.querySelector<SVGElement>(`[data-key="${focusNext}"]`);
    target?.focus();
    setFocusNext(null);
  }, [focusNext, graph]);

  const apply = (result: EditResult, select?: Selection): boolean => {
    setSaid(result.said);
    if (!result.ok) return false;
    setHistory((current) => commit(current, result.graph));
    if (select !== undefined) {
      setSelected(select);
      setFocusNext(select === null ? null : select.kind === 'node' ? `n${select.id}` : `e${select.index}`);
    }
    return true;
  };

  /** A point in client px to layout units, clamped by the model. */
  const toLayout = (clientX: number, clientY: number): Point | null => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (svg === null || svg === undefined || matrix === null || matrix === undefined) return null;
    const view = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: (view.x - box.x0) / box.scale, y: (view.y - box.y0) / box.scale };
  };

  const nodeAt = (clientX: number, clientY: number): number | null => {
    const hit = document.elementFromPoint(clientX, clientY)?.closest('[data-node]');
    const id = hit?.getAttribute('data-node');
    return id === null || id === undefined ? null : Number(id);
  };

  const connect = (from: number, to: number): void => {
    setPending(null);
    setRubber(null);
    const index = history.present.edges.length;
    apply(addEdge(history.present, from, to), { kind: 'edge', index });
  };

  const remove = (target: Selection): void => {
    if (target === null) return;
    if (target.kind === 'node') {
      const left = history.present.nodes.length - 1;
      apply(removeNode(history.present, target.id), left > 0 ? { kind: 'node', id: Math.min(target.id, left - 1) } : null);
    } else {
      apply(removeEdge(history.present, target.index), null);
    }
    setPending(null);
  };

  const openWeight = (index: number): void => {
    const edge = history.present.edges[index];
    if (edge === undefined) return;
    if (!history.present.weighted) {
      setSaid('This level does not use edge weights.');
      return;
    }
    setSelected({ kind: 'edge', index });
    setWeightOf({ index, draft: String(edge.weight ?? 1) });
  };

  const closeWeight = (keep: boolean): void => {
    if (weightOf === null) return;
    const { index, draft } = weightOf;
    setWeightOf(null);
    if (keep) {
      const value = Number(draft.replace(/−/g, '-').trim());
      if (draft.trim() === '' || !Number.isFinite(value)) setSaid('A weight is a number, like 4 or -2. Unchanged.');
      else if (value !== history.present.edges[index]?.weight) apply(setWeight(history.present, index, value));
    }
    setFocusNext(`e${index}`);
  };

  /* ---------------- pointer ---------------- */

  const onBackground = (event: PointerEvent<SVGRectElement>): void => {
    if (event.button !== 0) return;
    if (tool === 'node') {
      const at = toLayout(event.clientX, event.clientY);
      if (at !== null) apply(addNode(history.present, at), { kind: 'node', id: history.present.nodes.length });
      return;
    }
    setPending(null);
    setSelected(null);
  };

  const onNodeDown = (event: PointerEvent<SVGGElement>, id: number): void => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = { pointer: event.pointerId, node: id, startX: event.clientX, startY: event.clientY, moved: false };
  };

  const onNodeMove = (event: PointerEvent<SVGGElement>): void => {
    const current = press.current;
    if (current === null || current.pointer !== event.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < DRAG_SLOP) return;
    current.moved = true;
    const at = toLayout(event.clientX, event.clientY);
    if (at === null) return;
    if (tool === 'select') setPreview(moveNode(history.present, current.node, at));
    else if (tool === 'edge') setRubber({ from: current.node, to: at });
  };

  const onNodeUp = (event: PointerEvent<SVGGElement>): void => {
    const current = press.current;
    if (current === null || current.pointer !== event.pointerId) return;
    press.current = null;
    const id = current.node;
    if (tool === 'select') {
      if (current.moved && preview !== null) {
        setSaid(`Moved node ${id}.`);
        setHistory((history_) => commit(history_, preview));
      }
      setPreview(null);
      setSelected({ kind: 'node', id });
      setFocusNext(`n${id}`);
    } else if (tool === 'edge') {
      const target = current.moved ? nodeAt(event.clientX, event.clientY) : null;
      setRubber(null);
      if (current.moved) {
        if (target !== null && target !== id) connect(id, target);
        else setSaid('Release on another node to join them.');
      } else if (pending !== null && pending !== id) {
        connect(pending, id);
      } else {
        setPending(id);
        setSaid(`Joining from ${id}: click the node to join it to.`);
      }
    } else if (tool === 'delete') {
      remove({ kind: 'node', id });
    } else {
      setSelected({ kind: 'node', id });
      setFocusNext(`n${id}`);
    }
  };

  const onEdgeClick = (index: number): void => {
    if (tool === 'delete') remove({ kind: 'edge', index });
    else {
      setSelected({ kind: 'edge', index });
      setFocusNext(`e${index}`);
    }
  };

  /* ---------------- keys ---------------- */

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (weightOf !== null) return;
    const key = event.key;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && (key === 'z' || key === 'Z')) {
      event.preventDefault();
      setHistory((current) => (event.shiftKey ? redo(current) : undo(current)));
      setSaid(event.shiftKey ? 'Redone.' : 'Undone.');
      setPreview(null);
      return;
    }
    if (mod && (key === 'y' || key === 'Y')) {
      event.preventDefault();
      setHistory(redo);
      setSaid('Redone.');
      return;
    }
    if (mod || event.altKey) return;
    // Inside the toolbar, keys mean what they mean on its buttons.
    if (!(event.target instanceof Element) || svgRef.current === null || !svgRef.current.contains(event.target)) {
      if (key === 'Escape') setPending(null);
      return;
    }

    if (key === 'n' || key === 'N') {
      event.preventDefault();
      apply(addNode(history.present, freeSpot(history.present)), { kind: 'node', id: history.present.nodes.length });
      return;
    }
    if (key === 'Escape') {
      if (pending !== null) setSaid('Join cancelled.');
      setPending(null);
      return;
    }
    if (selected === null) return;

    if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      remove(selected);
      return;
    }
    if (selected.kind === 'node') {
      const id = selected.id;
      if (key === 'e' || key === 'E' || key === 'Enter') {
        event.preventDefault();
        if (pending !== null && pending !== id) connect(pending, id);
        else if (key !== 'Enter' || pending === id) {
          setPending(id);
          setSaid(`Joining from ${id}: Tab to the node to join it to and press Enter. Escape cancels.`);
        }
        return;
      }
      const step = (event.shiftKey ? NUDGE_BIG : NUDGE) / box.scale;
      const delta = key === 'ArrowLeft' ? [-step, 0] : key === 'ArrowRight' ? [step, 0] : key === 'ArrowUp' ? [0, -step] : key === 'ArrowDown' ? [0, step] : null;
      if (delta !== null) {
        event.preventDefault();
        const node = history.present.nodes[id];
        if (node === undefined) return;
        setHistory((current) => commit(current, moveNode(current.present, id, { x: node.x + (delta[0] ?? 0), y: node.y + (delta[1] ?? 0) })));
        setSaid(`Moved node ${id}.`);
      }
      return;
    }
    if (key === 'Enter') {
      event.preventDefault();
      openWeight(selected.index);
    }
  };

  /* ---------------- drawing ---------------- */

  const directedArrow = graph.directed ? 'url(#edit-arrow)' : undefined;
  const label = (id: number): string => {
    const degree = graph.edges.filter((edge) => edge.from === id || edge.to === id).length;
    return `Node ${id}, ${degree} edge${degree === 1 ? '' : 's'}${pending === id ? ', joining from here' : ''}`;
  };
  const edgeLabel = (index: number): string => {
    const edge = graph.edges[index];
    if (edge === undefined) return '';
    return `Edge ${edge.from} ${graph.directed ? 'to' : 'and'} ${edge.to}${edge.weight === undefined ? '' : `, weight ${edge.weight}`}`;
  };
  const isSelected = (key: string): boolean => (selected?.kind === 'node' ? `n${selected.id}` : selected?.kind === 'edge' ? `e${selected.index}` : null) === key;

  // Where the inline weight field sits, in px within the wrapper.
  const weightBox = ((): { left: number; top: number } | null => {
    if (weightOf === null) return null;
    const edge = geometry.edges[weightOf.index];
    const svg = svgRef.current;
    const wrap = wrapRef.current;
    const matrix = svg?.getScreenCTM();
    if (edge === undefined || matrix === null || matrix === undefined || wrap === null) return null;
    const at = new DOMPoint(edge.mx, edge.my).matrixTransform(matrix);
    const rect = wrap.getBoundingClientRect();
    return { left: at.x - rect.left, top: at.y - rect.top };
  })();

  const undoable = history.past.length > 0;
  const redoable = history.future.length > 0;

  return (
    <div ref={wrapRef} className="relative flex h-full min-h-0 flex-col" onKeyDown={onKeyDown}>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-panel px-2 py-1">
        <ChipGroup label="Tool">
          {TOOLS.map(([id, name, hint]) => (
            <Chip key={id} pressed={tool === id} onClick={() => { setTool(id); setPending(null); }} title={hint}>
              {name}
            </Chip>
          ))}
        </ChipGroup>
        <ChipGroup label="History">
          <Chip onClick={() => { setHistory(undo); setSaid('Undone.'); }} disabled={!undoable} title="Undo (Ctrl+Z)" aria-keyshortcuts="Control+Z">
            undo
          </Chip>
          <Chip onClick={() => { setHistory(redo); setSaid('Redone.'); }} disabled={!redoable} title="Redo (Ctrl+Y)" aria-keyshortcuts="Control+Y">
            redo
          </Chip>
        </ChipGroup>
        <Chip pressed={graph.directed} onClick={() => apply(setDirected(history.present, !history.present.directed))} title="Edges go one way (a-b goes a to b)">
          directed
        </Chip>
        <span className="font-mono text-micro tabular-nums text-fg-mute">
          {graph.nodes.length} nodes, {graph.edges.length} edges
        </span>
        <Button variant="primary" size="sm" className="ml-auto" onClick={onDone}>
          Done
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 bg-ground p-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${bandHeight(bottom, strips)}`}
          preserveAspectRatio="xMidYMid meet"
          className={`h-full w-full touch-none select-none ${tool === 'node' ? 'cursor-crosshair' : ''}`}
          role="group"
          aria-label={`Graph editor: ${graph.nodes.length} nodes and ${graph.edges.length} edges. Tab to a node; N adds one, E joins, arrows move, Delete removes.`}
          aria-describedby="graph-editor-keys"
        >
          <defs>
            <marker id="edit-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--viz-text-dim)" />
            </marker>
          </defs>
          <rect x={0} y={0} width={VIEW_W} height={bandHeight(bottom, strips)} fill="transparent" onPointerDown={onBackground} />

          {geometry.edges.map((edge, index) => {
            const path = edge.curve === null ? `M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2}` : `M ${edge.x1} ${edge.y1} Q ${edge.curve.x} ${edge.curve.y} ${edge.x2} ${edge.y2}`;
            const chosen = isSelected(`e${index}`);
            return (
              <g key={`line-${edge.id}`} pointerEvents="none">
                {chosen && <path d={path} fill="none" stroke="var(--color-focus)" strokeWidth={6} strokeOpacity={0.55} />}
                <path d={path} fill="none" stroke="var(--viz-text-dim)" strokeWidth={1.6} markerEnd={directedArrow} />
                {edge.weight !== null && (
                  <text x={edge.mx} y={edge.my + 4} textAnchor="middle" fontSize={11} fill="var(--viz-text)" stroke="var(--viz-bg)" strokeWidth={3} paintOrder="stroke" className="font-mono">
                    {edge.weight}
                  </text>
                )}
              </g>
            );
          })}

          {rubber !== null && (() => {
            const from = geometry.positions.get(String(rubber.from));
            if (from === undefined) return null;
            return <line x1={from.x} y1={from.y} x2={box.x0 + rubber.to.x * box.scale} y2={box.y0 + rubber.to.y * box.scale} stroke="var(--color-focus)" strokeWidth={2} strokeDasharray="5 4" pointerEvents="none" />;
          })()}

          {graph.nodes.map((_, id) => {
            const at = geometry.positions.get(String(id));
            if (at === undefined) return null;
            const key = `n${id}`;
            const chosen = isSelected(key);
            return (
              <g
                key={key}
                data-key={key}
                data-node={id}
                tabIndex={0}
                role="button"
                aria-label={label(id)}
                aria-pressed={chosen}
                transform={`translate(${at.x}, ${at.y})`}
                className="cursor-pointer outline-none"
                onFocus={() => setSelected({ kind: 'node', id })}
                onPointerDown={(event) => onNodeDown(event, id)}
                onPointerMove={onNodeMove}
                onPointerUp={onNodeUp}
                onPointerCancel={() => { press.current = null; setPreview(null); setRubber(null); }}
              >
                {(chosen || pending === id) && (
                  <circle r={radius + 4} fill="none" stroke="var(--color-focus)" strokeWidth={2.5} strokeDasharray={pending === id ? '4 3' : undefined} />
                )}
                <circle r={radius} fill="var(--viz-default)" />
                {radius >= 8 && (
                  <text y={radius * 0.36} textAnchor="middle" fontSize={Math.min(12, radius * 0.9)} fontWeight={600} fill={ink.default} className="font-mono" pointerEvents="none">
                    {id}
                  </text>
                )}
              </g>
            );
          })}

          {geometry.edges.map((edge, index) => {
            const path = edge.curve === null ? `M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2}` : `M ${edge.x1} ${edge.y1} Q ${edge.curve.x} ${edge.curve.y} ${edge.x2} ${edge.y2}`;
            const key = `e${index}`;
            return (
              <path
                key={`hit-${edge.id}`}
                data-key={key}
                d={path}
                tabIndex={0}
                role="button"
                aria-label={edgeLabel(index)}
                aria-pressed={isSelected(key)}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                className="cursor-pointer outline-none"
                onFocus={() => setSelected({ kind: 'edge', index })}
                onClick={() => onEdgeClick(index)}
                onDoubleClick={() => openWeight(index)}
              />
            );
          })}
        </svg>

        {weightOf !== null && weightBox !== null && (
          <input
            autoFocus
            aria-label={`Weight of the ${edgeLabel(weightOf.index).toLowerCase()}`}
            value={weightOf.draft}
            inputMode="decimal"
            onChange={(event) => setWeightOf({ ...weightOf, draft: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') closeWeight(true);
              if (event.key === 'Escape') closeWeight(false);
              event.stopPropagation();
            }}
            onBlur={() => closeWeight(true)}
            className="absolute w-16 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-focus bg-ground px-1 py-0.5 text-center font-mono text-meta text-fg outline-none"
            style={{ left: weightBox.left, top: weightBox.top }}
          />
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-baseline gap-x-3 border-t border-line bg-panel px-3 py-1 text-micro text-fg-mute">
        <p role="status" className="min-w-0 flex-1 text-fg-dim">
          {said}
        </p>
        <p id="graph-editor-keys" className="font-mono">
          {KEY_HINT}
        </p>
      </div>
    </div>
  );
}

const KEY_HINT = 'Tab nodes · N add · E join · arrows move · Enter weight · Del remove · Ctrl+Z undo. Positions you place stay in this tab: a link shares the edges only.';
