import { describe, expect, it } from 'vitest';

import { resolveRoute } from './routes';

describe('resolveRoute', () => {
  it('maps the known pages', () => {
    expect(resolveRoute('/')).toEqual({ page: 'home' });
    expect(resolveRoute('/browse/')).toEqual({ page: 'browse' });
    expect(resolveRoute('/visualize/avl')).toEqual({ page: 'visualize', id: 'avl' });
    expect(resolveRoute('/visualize/a%20b/')).toEqual({ page: 'visualize', id: 'a b' });
  });

  it('treats a malformed escape as not found instead of throwing', () => {
    expect(() => resolveRoute('/visualize/%E0%A4%A')).not.toThrow();
    expect(resolveRoute('/visualize/%E0%A4%A')).toEqual({ page: 'not-found' });
  });

  it('sends anything else to not found', () => {
    expect(resolveRoute('/nope')).toEqual({ page: 'not-found' });
    expect(resolveRoute('/visualize/a/b')).toEqual({ page: 'not-found' });
  });
});
