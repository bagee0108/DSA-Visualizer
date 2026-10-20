import { describe, expect, it } from 'vitest';

import { paramsToSearch, searchToParams } from '../pages/VisualizePage';
import { formatMap, MAX_MAP_COLS, MAX_MAP_ROWS, mapFromText, mapSizeOf, mapToText, parseMap } from './gridMap';

const LINE = 'S..#/..#./....G';
const TEXT = 'S..#\n..#.\n....G';

describe('grid maps', () => {
  it('reads rows of S, G, # and .', () => {
    const parsed = parseMap('S.#/..G');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual({ rows: 2, cols: 3, walls: [false, false, true, false, false, false], start: { row: 0, col: 0 }, goal: { row: 1, col: 2 } });
  });

  it('round-trips: the field text to the one-line form and back, and a parsed map to the same line', () => {
    const fixed = 'S..#/..#./...G';
    expect(mapFromText(mapToText(fixed))).toBe(fixed);
    expect(mapFromText('S..#\n..#.\r\n...G')).toBe(fixed);
    expect(mapToText(fixed)).toBe('S..#\n..#.\n...G');
    const parsed = parseMap(fixed);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(formatMap(parsed.value)).toBe(fixed);
    // Lower case, blanks and a trailing empty row (an Enter at the end of the field) read the same, and format to the canonical line.
    const loose = parseMap(' s . . # \n..#.\n...g\n');
    if (!loose.ok) throw new Error(loose.error);
    expect(formatMap(loose.value)).toBe(fixed);
  });

  it('round-trips through the URL query, where # is percent-encoded', () => {
    const search = paramsToSearch({ map: 'S..#/..#./...G' }, {});
    expect(search).toBe('?map=S..%23/..%23./...G');
    expect(searchToParams(search).map).toBe('S..#/..#./...G');
  });

  it('refuses maps it cannot read, saying why', () => {
    const error = (raw: string): string => {
      const parsed = parseMap(raw);
      return parsed.ok ? 'ok' : parsed.error;
    };
    expect(error('')).toContain('Draw a map');
    expect(error('S../..G/.')).toContain('Row 3 has 1 squares');
    expect(error('S.x/..G')).toContain('"X"');
    expect(error('S../..S/G..')).toContain('exactly one S; it has 2');
    expect(error('S../...')).toContain('exactly one G; it has 0');
    expect(error(Array.from({ length: MAX_MAP_ROWS + 1 }, (_, i) => (i === 0 ? 'SG' : '..')).join('/'))).toContain(`cap is ${MAX_MAP_ROWS}`);
    expect(error(`SG${'.'.repeat(MAX_MAP_COLS - 1)}`)).toContain(`cap is ${MAX_MAP_COLS}`);
  });

  it('sizes the slider by columns', () => {
    expect(mapSizeOf({ map: LINE.replace('/....G', '/...G') })).toBe(4);
    expect(mapSizeOf({ map: 'nonsense' })).toBe(0);
    expect(mapToText(LINE)).toBe(TEXT);
  });
});
