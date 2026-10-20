/**
 * A grid map: rows of S (start), G (goal), # (wall) and . (open). The field
 * shows one row per line; the URL carries the same rows on one line, joined
 * with "/", as in S..#/..#G. A "#" is percent-encoded there (%23), since a raw
 * one would start the URL's fragment.
 */

import type { ParamMap, ParseResult } from './define';

/** The most rows and columns a map may have, so each square stays big enough for its f, g and h. */
export const MAX_MAP_ROWS = 9;
export const MAX_MAP_COLS = 20;

export interface Square {
  readonly row: number;
  readonly col: number;
}

export interface GridMap {
  readonly rows: number;
  readonly cols: number;
  /** Row-major. */
  readonly walls: readonly boolean[];
  readonly start: Square;
  readonly goal: Square;
}

/** The field's text to the one-line form: each line break becomes "/". Kept raw while typing, so an empty last line survives. */
export function mapFromText(text: string): string {
  return text.replace(/\r\n?|\n/g, '/');
}

/** The one-line form to the field's text, one row per line. */
export function mapToText(value: string): string {
  return value.split('/').join('\n');
}

export function parseMap(raw: string): ParseResult<GridMap> {
  const lines = mapFromText(raw)
    .split('/')
    .map((line) => line.replace(/\s+/g, '').toUpperCase())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return { ok: false, error: 'Draw a map: rows of S, G, # and . (start, goal, wall, open).' };
  if (lines.length > MAX_MAP_ROWS) return { ok: false, error: `${lines.length} rows; the cap is ${MAX_MAP_ROWS}, so each square has room for its f, g and h.` };
  const cols = (lines[0] ?? '').length;
  if (cols > MAX_MAP_COLS) return { ok: false, error: `${cols} columns; the cap is ${MAX_MAP_COLS}, so each square has room for its f, g and h.` };

  const walls: boolean[] = [];
  const starts: Square[] = [];
  const goals: Square[] = [];
  for (let row = 0; row < lines.length; row++) {
    const line = lines[row] ?? '';
    if (line.length !== cols) return { ok: false, error: `Row ${row + 1} has ${line.length} squares; the first row has ${cols}. Every row needs the same number.` };
    for (let col = 0; col < cols; col++) {
      const ch = line[col];
      if (ch !== 'S' && ch !== 'G' && ch !== '#' && ch !== '.') {
        return { ok: false, error: `Row ${row + 1} has "${ch ?? ''}". Use S for the start, G for the goal, # for a wall and . for open ground.` };
      }
      walls.push(ch === '#');
      if (ch === 'S') starts.push({ row, col });
      if (ch === 'G') goals.push({ row, col });
    }
  }
  const [start] = starts;
  const [goal] = goals;
  if (starts.length !== 1 || start === undefined) return { ok: false, error: `The map needs exactly one S; it has ${starts.length}.` };
  if (goals.length !== 1 || goal === undefined) return { ok: false, error: `The map needs exactly one G; it has ${goals.length}.` };
  return { ok: true, value: { rows: lines.length, cols, walls, start, goal } };
}

/** The one-line form of a map, as it goes in the URL. */
export function formatMap(map: GridMap): string {
  const rows: string[] = [];
  for (let row = 0; row < map.rows; row++) {
    let line = '';
    for (let col = 0; col < map.cols; col++) {
      if (row === map.start.row && col === map.start.col) line += 'S';
      else if (row === map.goal.row && col === map.goal.col) line += 'G';
      else line += map.walls[row * map.cols + col] === true ? '#' : '.';
    }
    rows.push(line);
  }
  return rows.join('/');
}

/** Columns, for the preset size slider. */
export function mapSizeOf(params: ParamMap): number {
  const parsed = parseMap(params.map ?? '');
  return parsed.ok ? parsed.value.cols : 0;
}
