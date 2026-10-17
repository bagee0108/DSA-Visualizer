import { describe, expect, it } from 'vitest';

import { counted } from './canvas';

describe('counted', () => {
  it('keeps one in the singular', () => {
    expect(counted(1, 'node')).toBe('1 node');
    expect(counted(0, 'node')).toBe('0 nodes');
    expect(counted(7, 'edge')).toBe('7 edges');
  });
});
