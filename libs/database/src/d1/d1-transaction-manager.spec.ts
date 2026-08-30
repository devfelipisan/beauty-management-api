import { D1TransactionManager } from './d1-transaction-manager.js';
import type { D1DatabaseLike } from './d1.types.js';

describe('D1TransactionManager', () => {
  it('executes work through a database session', async () => {
    const prepared = { bind: () => prepared, first: async () => ({ ok: true }), all: async () => ({ results: [] }), run: async () => ({ success: true }) };
    const database = { prepare: () => prepared, batch: async () => [] } as never as D1DatabaseLike;
    const manager = new D1TransactionManager(database);

    await expect(manager.execute(async (session) => (await session.prepare('SELECT 1').first<{ ok: boolean }>())?.ok)).resolves.toBe(true);
  });

  it('normalizes transaction failures', async () => {
    const manager = new D1TransactionManager({ prepare: () => { throw new Error('raw SQL'); }, batch: async () => [] } as never as D1DatabaseLike);

    await expect(manager.execute(async (session) => session.prepare('SELECT 1').run())).rejects.toMatchObject({
      message: 'DATABASE_TRANSACTION_FAILED',
    });
  });
});
