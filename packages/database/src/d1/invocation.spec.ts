import { describe, expect, it } from 'vitest';
import { executionEnv, scopeEntrypoint } from './invocation.js';
import type { D1DatabaseLike } from './d1.types.js';

describe('Worker invocation composition', () => {
  const env = { D1_DATABASE: {} as D1DatabaseLike };
  class Entrypoint {
    constructor(readonly env: typeof env) {}
    inner() {
      return executionEnv(this.env);
    }
    async outer() {
      const first = this.inner();
      await Promise.resolve();
      return [first, this.inner()];
    }
  }
  const surface = Object.getOwnPropertyNames(Entrypoint.prototype);
  scopeEntrypoint(Entrypoint);
  it('shares the scoped binding through internal async delegation and isolates incoming calls', async () => {
    const worker = new Entrypoint(env);
    const [one, two] = await Promise.all([worker.outer(), worker.outer()]);
    expect(one[0]).toBe(one[1]);
    expect(two[0]).toBe(two[1]);
    expect(one[0]).not.toBe(two[0]);
    expect(one[0].D1_DATABASE).not.toBe(env.D1_DATABASE);
    expect(Object.getOwnPropertyNames(Entrypoint.prototype)).toEqual(surface);
    expect(() => executionEnv(env)).toThrow('INVOCATION_CONTEXT_REQUIRED');
  });
});
