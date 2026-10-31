import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { D1UnitOfWork } from '@beauty/reliability/d1/d1-unit-of-work';
import { D1OutboxDeliveryRepository } from '@beauty/reliability/d1/d1-outbox-delivery-repository';

describe('reliability-only transactions and delivery ownership in physical D1', () => {
  it('commits audit and outbox without a domain mutation and rolls back on failure', async () => {
    const id = crypto.randomUUID();
    const uow = new D1UnitOfWork(env.D1_DATABASE);
    await uow.execute(async ({ audit, outbox }) => {
      await audit.append({
        id,
        action: 'test',
        resourceType: 'TEST',
        requestId: id,
        correlationId: id,
        occurredAt: '2028-01-01',
      });
      await outbox.append({
        id,
        type: 'Test',
        aggregateType: 'TEST',
        aggregateId: id,
        correlationId: id,
        payload: {},
        status: 'PENDING',
        createdAt: '2028-01-01',
      });
    });
    expect(
      await env.D1_DATABASE.prepare('SELECT id FROM audit_events WHERE id=?')
        .bind(id)
        .first(),
    ).toEqual({ id });
    expect(
      await env.D1_DATABASE.prepare('SELECT id FROM outbox_events WHERE id=?')
        .bind(id)
        .first(),
    ).toEqual({ id });
    const rolledBack = crypto.randomUUID();
    await expect(
      uow.execute(async ({ audit, outbox }) => {
        await audit.append({
          id: rolledBack,
          action: 'test',
          resourceType: 'TEST',
          requestId: id,
          correlationId: id,
          occurredAt: '2028-01-01',
        });
        // Duplicate primary key must roll back the audit in the same batch.
        await outbox.append({
          id,
          type: 'Test',
          aggregateType: 'TEST',
          aggregateId: id,
          correlationId: id,
          payload: {},
          status: 'PENDING',
          createdAt: '2028-01-01',
        });
      }),
    ).rejects.toThrow();
    expect(
      await env.D1_DATABASE.prepare('SELECT id FROM audit_events WHERE id=?')
        .bind(rolledBack)
        .first(),
    ).toBeNull();
  });

  it('recovers only owned event types and rejects stale acknowledgements', async () => {
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    for (const [index, id] of ids.entries()) {
      await env.D1_DATABASE.prepare(
        "INSERT INTO outbox_events (id,event_type,aggregate_type,aggregate_id,correlation_id,payload_json,status,created_at,available_at,claimed_by,claim_expires_at) VALUES (?,?,'TEST',?,?,'{}','PROCESSING',?,?,?,?)",
      )
        .bind(
          id,
          index ? 'OtherOwner' : 'Owned',
          id,
          id,
          '2028-01-01',
          '2028-01-01',
          'old-execution',
          '2028-01-01',
        )
        .run();
    }
    const repo = new D1OutboxDeliveryRepository(env.D1_DATABASE, ['Owned']);
    expect(await repo.recoverExpiredClaims('2028-01-02')).toBe(1);
    expect(await repo.claim(ids[0], 'new-execution', '2028-01-02', 60)).toBe(
      true,
    );
    expect(await repo.markSent(ids[0], 'old-execution', '2028-01-02')).toBe(
      false,
    );
    expect(await repo.markSent(ids[0], 'new-execution', '2028-01-02')).toBe(
      true,
    );
    expect(
      await env.D1_DATABASE.prepare(
        'SELECT status,claimed_by FROM outbox_events WHERE id=?',
      )
        .bind(ids[1])
        .first(),
    ).toEqual({ status: 'PROCESSING', claimed_by: 'old-execution' });
  });
});
