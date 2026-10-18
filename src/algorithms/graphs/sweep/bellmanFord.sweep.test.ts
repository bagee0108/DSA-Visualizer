import { describe, it } from 'vitest';

import { expectCleanSweep } from '../graphTestkit';
import { bellmanFord } from '../bellmanFord';

describe('bellmanFord: layout clearance over 20 seeds', () => {
  // Passes today; keeps passing.
  it('keeps edges off nodes and nodes apart on every preset, at 6, 12, 40 and 150 nodes, for every sweep seed', () => {
    expectCleanSweep(bellmanFord);
  }, 120000);
});
