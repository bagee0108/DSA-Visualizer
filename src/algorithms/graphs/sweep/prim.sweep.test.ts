import { describe, it } from 'vitest';

import { expectCleanSweep } from '../graphTestkit';
import { prim } from '../prim';

describe('prim: layout clearance over 20 seeds', () => {
  // Passes today; keeps passing.
  it('keeps edges off nodes and nodes apart on every preset, at 6, 12, 40 and 150 nodes, for every sweep seed', () => {
    expectCleanSweep(prim);
  }, 120000);
});
