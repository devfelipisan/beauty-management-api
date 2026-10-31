import { D1UnitOfWork } from './d1-unit-of-work.js';
describe('D1UnitOfWork', () => {
  it('commits reliability-only work and skips an empty unit', async () => {
    const batch = vi.fn(async (statements: unknown[]) =>
      statements.map(() => ({ success: true })),
    );
    const db = { prepare: () => ({ bind: () => ({}) }), batch } as never;
    const uow = new D1UnitOfWork(db);
    await expect(uow.execute(async () => 'empty')).resolves.toBe('empty');
    expect(batch).not.toHaveBeenCalled();
    await uow.execute(async ({ audit }) => {
      await audit.append({
        id: 'audit',
        action: 'test',
        resourceType: 'TEST',
        requestId: 'r',
        correlationId: 'c',
        occurredAt: 'now',
      });
    });
    expect(batch).toHaveBeenCalledExactlyOnceWith([{}]);
    batch.mockClear();
    await uow.execute(async ({ outbox }) => {
      await outbox.append({
        id: 'event',
        type: 'Test',
        aggregateType: 'TEST',
        aggregateId: 'a',
        correlationId: 'c',
        payload: {},
        status: 'PENDING',
        createdAt: 'now',
      });
    });
    expect(batch).toHaveBeenCalledExactlyOnceWith([{}]);
    batch.mockClear();
    await uow.execute(async ({ idempotency }) => {
      await idempotency.reserve({
        id: 'key',
        tenantId: 'tenant',
        operation: 'TEST',
        key: 'key',
        requestHash: 'hash',
        status: 'PROCESSING',
        createdAt: 'now',
        updatedAt: 'now',
      });
    });
    expect(batch).toHaveBeenCalledExactlyOnceWith([{}]);
  });
  it('batches audit and outbox writes after successful operation', async () => {
    const calls: unknown[][] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => {
          calls.push([sql, ...values]);
          return {};
        },
      }),
      batch: async (statements: unknown[]) => {
        expect(statements).toHaveLength(2);
        return statements.map(() => ({ success: true }));
      },
    } as never;
    const uow = new D1UnitOfWork(db);
    await uow.execute(async ({ audit, outbox }) => {
      await audit.append({
        id: 'a',
        action: 'x',
        resourceType: 'y',
        requestId: 'r',
        correlationId: 'c',
        occurredAt: 'now',
      });
      await outbox.append({
        id: 'o',
        type: 'x',
        aggregateType: 'y',
        aggregateId: 'z',
        correlationId: 'c',
        payload: {},
        status: 'PENDING',
        createdAt: 'now',
      });
    });
    expect(calls).toHaveLength(2);
  });
  it('does not write when operation fails before commit', async () => {
    let batches = 0;
    const db = {
      prepare: () => ({ bind: () => ({}) }),
      batch: async () => {
        batches++;
        return [];
      },
    } as never;
    await expect(
      new D1UnitOfWork(db).execute(async ({ audit }) => {
        await audit.append({
          id: 'a',
          action: 'x',
          resourceType: 'y',
          requestId: 'r',
          correlationId: 'c',
          occurredAt: 'now',
        });
        throw new Error('failure');
      }),
    ).rejects.toThrow('failure');
    expect(batches).toBe(0);
  });
});
