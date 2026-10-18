import { describe, it } from 'vitest';

import { expectCleanSweep } from '../graphTestkit';
import { dijkstra } from '../dijkstra';

describe('dijkstra: layout clearance over 20 seeds', () => {
  // Failed some seeds at 150 nodes before the repair could relocate stuck nodes; passes since.
  it('keeps edges off nodes and nodes apart on every preset, at 6, 12, 40 and 150 nodes, for every sweep seed', () => {
    expectCleanSweep(dijkstra);
  }, 120000);
});
