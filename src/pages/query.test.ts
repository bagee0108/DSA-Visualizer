import { describe, expect, it } from 'vitest';

import { bellmanFord } from '../algorithms/graphs/bellmanFord';
import { lastFrame } from '../algorithms/frameHygiene';
import { parseEdgeList, toAsciiMinus } from '../core/graphInput';
import type { ParamMap } from '../core/define';
import { paramsToSearch, searchToParams } from './VisualizePage';

const NEGATIVE = '0-1:-4,1-2:3,0-2:5,2-3:-2,3-1:6';

function labelsOf(params: ParamMap): Readonly<Record<string, string>> {
  const built = bellmanFord.build(params);
  if (!built.ok) throw new Error(built.error);
  const final = lastFrame(built.frames).structure;
  if (final.kind !== 'graph') throw new Error('not a graph');
  return final.labels;
}

describe('negative weights in the URL', () => {
  it('round-trips a negative-weight graph through the query string as plain ASCII', () => {
    const params = { ...bellmanFord.defaults, g: NEGATIVE, start: '0' };
    const search = paramsToSearch(params, bellmanFord.defaults);
    expect(search).toMatch(/^[\x20-\x7e]*$/);
    expect(search).toContain('g=0-1:-4,1-2:3');
    const back = { ...bellmanFord.defaults, ...searchToParams(search) };
    expect(back).toEqual(params);
    expect(labelsOf(back)).toEqual(labelsOf(params));
  });

  it('accepts a pasted true minus, and the field turns it back into a hyphen', () => {
    const pasted = NEGATIVE.replace(/-/g, '\u2212');
    expect(toAsciiMinus(pasted)).toBe(NEGATIVE);
    const a = parseEdgeList(pasted, { directed: true, requireWeights: true });
    const b = parseEdgeList(NEGATIVE, { directed: true, requireWeights: true });
    expect(a).toEqual(b);
    expect(paramsToSearch({ g: toAsciiMinus(pasted) }, {})).toMatch(/^[\x20-\x7e]*$/);
  });

  it('draws negatives with a true minus only on the canvas, never in the params', () => {
    const labels = Object.values(labelsOf({ ...bellmanFord.defaults, g: NEGATIVE, start: '0' }));
    expect(labels.some((label) => label.startsWith('\u2212'))).toBe(true);
    expect(labels.some((label) => label.startsWith('-'))).toBe(false);
  });
});
