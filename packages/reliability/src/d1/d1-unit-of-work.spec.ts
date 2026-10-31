import { D1UnitOfWork } from './d1-unit-of-work.js';
describe('D1UnitOfWork', () => {
  it('stages completion of a previously persisted reservation in the same native batch', async () => {
    const f = fixture();
    await f.uow.execute(async (t) => {
      t.persistence.add({
        kind: 'D1_SQL',
        sql: 'UPDATE resource SET value=? WHERE tenant_id=?',
        params: ['value', 'tenant'],
        expectedChanges: 1,
      });
      await t.idempotency.complete('tenant', 'UPLOAD', 'existing', {
        id: 'photo',
      });
    });
    expect(f.batch).toHaveBeenCalledTimes(1);
    const statements = f.batch.mock.calls[0][0] as Array<{
      sql: string;
      params: unknown[];
    }>;
    expect(
      statements.filter((statement) =>
        statement.sql.startsWith('UPDATE idempotency_records'),
      ),
    ).toEqual([
      expect.objectContaining({
        sql: expect.stringContaining("AND status='PROCESSING'"),
        params: [
          '{"id":"photo"}',
          expect.any(String),
          'tenant',
          'UPLOAD',
          'existing',
        ],
      }),
    ]);
    expect(
      statements.some((statement) =>
        statement.sql.startsWith('INSERT INTO idempotency_records'),
      ),
    ).toBe(false);
  });
  function fixture() {
    const batch = vi.fn(async (statements: unknown[]) =>
      statements.map(() => ({ success: true })),
    );
    const prepare = vi.fn((sql: string) => ({
      bind: (...params: unknown[]) => ({ sql, params }),
    }));
    return {
      batch,
      prepare,
      uow: new D1UnitOfWork({ prepare, batch } as never),
    };
  }

  it('keeps staged idempotency records isolated by tenant, operation and key and persists the completed response', async () => {
    const f = fixture();
    await f.uow.execute(async ({ idempotency }) => {
      const record = {
        id: 'id',
        tenantId: 'tenant',
        operation: 'UPDATE',
        key: 'key',
        requestHash: 'hash',
        status: 'PROCESSING' as const,
        createdAt: 'created',
        updatedAt: 'created',
      };
      await idempotency.reserve(record);
      expect(await idempotency.find('other', 'UPDATE', 'key')).toBeNull();
      expect(await idempotency.find('tenant', 'OTHER', 'key')).toBeNull();
      expect(await idempotency.find('tenant', 'UPDATE', 'other')).toBeNull();

      await idempotency.complete('tenant', 'UPDATE', 'key', { result: 'done' });
      expect(await idempotency.find('tenant', 'UPDATE', 'key')).toMatchObject({
        status: 'COMPLETED',
        response: { result: 'done' },
      });
    });
    expect(f.batch).toHaveBeenCalledTimes(1);
    expect(f.batch.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        params: [
          'id',
          'tenant',
          'UPDATE',
          'key',
          'hash',
          'COMPLETED',
          '{"result":"done"}',
          'created',
          expect.any(String),
        ],
      }),
    ]);
  });

  it('marks only the matching staged reservation failed and skips unrelated completion/failure requests', async () => {
    const f = fixture();
    await f.uow.execute(async ({ idempotency }) => {
      await idempotency.reserve({
        id: 'id',
        tenantId: 'tenant',
        operation: 'UPDATE',
        key: 'key',
        requestHash: 'hash',
        status: 'PROCESSING',
        createdAt: 'created',
        updatedAt: 'created',
      });

      expect(await idempotency.find('tenant', 'UPDATE', 'key')).toMatchObject({
        status: 'PROCESSING',
      });
      await idempotency.fail('tenant', 'UPDATE', 'key');
      expect(await idempotency.find('tenant', 'UPDATE', 'key')).toMatchObject({
        status: 'FAILED',
      });
    });
    expect(f.batch.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        params: [
          'id',
          'tenant',
          'UPDATE',
          'key',
          'hash',
          'FAILED',
          null,
          'created',
          expect.any(String),
        ],
      }),
    ]);
  });

  it('batches mutations, expected-change assertions and populated reliability metadata together', async () => {
    const f = fixture();
    const response = await f.uow.execute(
      async ({ persistence, audit, outbox }) => {
        persistence.add({
          sql: 'UPDATE resource SET value=? WHERE tenant_id=?',
          params: [1, 'tenant'],
          expectedChanges: 1,
        });
        await audit.append({
          id: 'audit',
          tenantId: 'tenant',
          actorId: 'actor',
          action: 'updated',
          resourceType: 'RESOURCE',
          resourceId: 'resource',
          requestId: 'request',
          correlationId: 'correlation',
          metadata: { reason: 'test' },
          occurredAt: 'now',
        });
        await outbox.append({
          id: 'event',
          tenantId: 'tenant',
          type: 'Updated',
          aggregateType: 'RESOURCE',
          aggregateId: 'resource',
          correlationId: 'correlation',
          payload: { value: 1 },
          status: 'PENDING',
          createdAt: 'now',
        });
        return 'result';
      },
    );
    expect(response).toBe('result');
    expect(f.batch).toHaveBeenCalledTimes(1);
    const statements = f.batch.mock.calls[0][0];
    expect(statements).toHaveLength(5);
    expect(statements[0]).toEqual({
      sql: 'UPDATE resource SET value=? WHERE tenant_id=?',
      params: [1, 'tenant'],
    });
    expect(statements[1]).toMatchObject({ params: [expect.any(String), 1] });
    expect(statements[3]).toMatchObject({
      params: [
        'audit',
        'tenant',
        'actor',
        'updated',
        'RESOURCE',
        'resource',
        'request',
        'correlation',
        '{"reason":"test"}',
        'now',
      ],
    });
    expect(statements[4]).toMatchObject({
      params: [
        'event',
        'tenant',
        'Updated',
        'RESOURCE',
        'resource',
        'correlation',
        '{"value":1}',
        'PENDING',
        'now',
      ],
    });
  });

  it.each([undefined, 'RESOURCE_CONFLICT'])(
    'reports failed mutations using their explicit code or UoW fallback (%s)',
    async (failureCode) => {
      const f = fixture();
      f.batch.mockResolvedValue([{ success: false }]);
      await expect(
        f.uow.execute(async ({ persistence }) => {
          persistence.add({
            sql: 'UPDATE resource SET value=1',
            params: [],
            failureCode,
          });
        }),
      ).rejects.toThrow(failureCode ?? 'UNIT_OF_WORK_FAILED');
    },
  );

  it('reports failure of a reliability statement even when the domain statement succeeded', async () => {
    const f = fixture();
    f.batch.mockResolvedValue([{ success: true }, { success: false }]);
    await expect(
      f.uow.execute(async ({ persistence, audit }) => {
        persistence.add({ sql: 'UPDATE resource SET value=1', params: [] });
        await audit.append({
          id: 'id',
          action: 'updated',
          resourceType: 'RESOURCE',
          requestId: 'request',
          correlationId: 'correlation',
          occurredAt: 'now',
        });
      }),
    ).rejects.toThrow('UNIT_OF_WORK_FAILED');
  });

  it.each([
    new Error('D1_ERROR: UNIT_OF_WORK_EXPECTED_CHANGES'),
    new Error('DATABASE_DOWN'),
    'transport failure',
  ])(
    'propagates batch rejection and normalizes only the assertion failure (%s)',
    async (failure) => {
      const f = fixture();
      f.batch.mockRejectedValue(failure);
      const operation = f.uow.execute(async ({ persistence }) => {
        persistence.add({
          sql: 'UPDATE resource SET value=1',
          params: [],
          expectedChanges: 1,
        });
      });
      if (
        failure instanceof Error &&
        failure.message.includes('UNIT_OF_WORK_EXPECTED_CHANGES')
      )
        await expect(operation).rejects.toThrow(
          /^UNIT_OF_WORK_EXPECTED_CHANGES$/,
        );
      else await expect(operation).rejects.toBe(failure);
    },
  );

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
