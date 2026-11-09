import { describe, expect, it } from 'vitest';
import { D1SelectorWorkspaceProvider } from './d1-selector-workspace-provider.js';
import type { D1DatabaseLike } from '@beauty/database/d1/d1.types';

describe('selector demo configuration', () => {
  const db = {
    prepare() {
      throw new Error('database must not be accessed');
    },
  } as unknown as D1DatabaseLike;
  it('fails closed for absent, malformed, empty, duplicate or unsafe tenant allowlists before reading D1', () => {
    for (const value of [
      undefined,
      '',
      'null',
      '{}',
      '[]',
      '["tenant","tenant"]',
      '["a/b"]',
      '[1]',
      JSON.stringify(Array.from({ length: 11 }, (_, i) => `t${i}`)),
    ]) {
      expect(() => new D1SelectorWorkspaceProvider(db, value)).toThrow(
        'SELECTOR_DEMO_CONFIGURATION_INVALID',
      );
    }
  });
  it('denies a guessed non-demo tenant before consulting roles or permissions', async () => {
    const provider = new D1SelectorWorkspaceProvider(db, '["synthetic"]');
    await expect(
      provider.resolve('real-tenant', 'administrator'),
    ).rejects.toThrow('PERMISSION_DENIED');
  });
});
