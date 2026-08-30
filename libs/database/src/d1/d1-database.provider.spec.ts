import { createD1DatabaseProvider } from './d1-database.provider.js';
import { D1_DATABASE } from '../tokens.js';
import type { D1DatabaseLike } from './d1.types.js';

describe('createD1DatabaseProvider', () => {
  it('creates an explicit D1 token provider', () => {
    const binding = { prepare: () => ({}) , batch: async () => [] } as never as D1DatabaseLike;
    expect(createD1DatabaseProvider(binding)).toEqual({ provide: D1_DATABASE, useValue: binding });
  });

  it('rejects a missing binding instead of falling back silently', () => {
    expect(() => createD1DatabaseProvider(undefined as never)).toThrow('D1_DATABASE binding is required');
  });
});
