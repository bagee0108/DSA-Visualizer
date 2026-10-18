import { describe, it } from 'vitest';

import { expectCleanSweep } from '../graphTestkit';
import { unionFind } from '../unionFind';

describe('unionFind: layout clearance over 20 seeds', () => {
  // Failed some seeds at 150 nodes before the repair could relocate stuck nodes; passes since.
  it('keeps edges off nodes and nodes apart on every preset, at 6, 12, 40 and 150 nodes, for every sweep seed', () => {
    expectCleanSweep(unionFind);
  }, 120000);
});
