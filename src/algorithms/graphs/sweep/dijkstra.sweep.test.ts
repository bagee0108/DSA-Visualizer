import { describe, it } from 'vitest';

import { expectCleanSweep } from '../graphTestkit';
import { dijkstra } from '../dijkstra';

describe('dijkstra: layout clearance over 20 seeds', () => {
  // Fails on today's layout: some seeds leave an edge under a node at 150 nodes. See the
  // multi-seed sweep commit for the table. Comes off it.fails once the layout passes.
  it.fails('keeps edges off nodes and nodes apart on every preset, at 6, 12, 40 and 150 nodes, for every sweep seed', () => {
    expectCleanSweep(dijkstra);
  }, 120000);
});
