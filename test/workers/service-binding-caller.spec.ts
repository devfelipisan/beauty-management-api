import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, expect, it } from 'vitest';

type DispatchBinding = {
  dispatchOutboxBatch(input: {
    workerId: string;
    batchSize: number;
    leaseSeconds: number;
    caller?: string;
  }): Promise<{
    inspected: number;
    claimed: number;
    sent: number;
    retried: number;
    dead: number;
  }>;
};
const bindings = env as unknown as {
  TEST_CALLER_DB: D1Database;
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
  TEST_CALLER_ALLOWED: DispatchBinding;
  TEST_CALLER_MISSING: DispatchBinding;
  TEST_CALLER_WRONG: DispatchBinding;
};
beforeAll(async () => {
  await applyD1Migrations(bindings.TEST_CALLER_DB, bindings.TEST_MIGRATIONS);
});
const command = { workerId: 'caller-proof', batchSize: 5, leaseSeconds: 60 };
it('propagates the configured caller to the real production Billing receiver', async () => {
  await expect(
    bindings.TEST_CALLER_ALLOWED.dispatchOutboxBatch({
      ...command,
      caller: 'browser',
    }),
  ).resolves.toEqual({
    inspected: 0,
    claimed: 0,
    sent: 0,
    retried: 0,
    dead: 0,
  });
});
it('denies missing, incorrect and payload-only caller without changing persisted state', async () => {
  for (const [binding, input] of [
    [bindings.TEST_CALLER_MISSING, command],
    [bindings.TEST_CALLER_WRONG, command],
    [
      bindings.TEST_CALLER_MISSING,
      { ...command, caller: 'beauty-operations-worker' },
    ],
  ] as const) {
    const error = await binding.dispatchOutboxBatch(input).then(
      () => undefined,
      (error: Error) => error,
    );
    expect(error?.message).toContain('PERMISSION_DENIED');
  }
  const row = await bindings.TEST_CALLER_DB.prepare(
    'SELECT COUNT(*) AS count FROM outbox_events',
  ).first<{ count: number }>();
  expect(row?.count).toBe(0);
});
