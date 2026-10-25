import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { D1UnitOfWork } from '@beauty/reliability/d1/d1-unit-of-work';
import { D1IdempotencyStore } from '@beauty/reliability/d1/d1-reliability-store';

const now = '2026-09-10T00:00:00.000Z';

describe('physical D1 reliability and idempotency', () => {
  it('commits business, audit and outbox writes as one batch', async () => {
    const unitOfWork = new D1UnitOfWork(env.D1_DATABASE);
    await unitOfWork.execute(async ({ persistence, audit, outbox }) => {
      persistence.add({ kind: 'D1_SQL', sql: 'INSERT INTO tenants (id, legal_name, display_name, document, timezone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params: ['tenant-reliability-success', 'Legal', 'Display', 'reliability-success', 'UTC', 'ACTIVE', now, now] });
      await audit.append({ id: 'audit-reliability-success', tenantId: 'tenant-reliability-success', actorId: 'actor-dev-admin', action: 'CREATE', resourceType: 'TENANT', resourceId: 'tenant-reliability-success', requestId: 'request-success', correlationId: 'correlation-success', occurredAt: now });
      await outbox.append({ id: 'outbox-reliability-success', tenantId: 'tenant-reliability-success', type: 'TENANT_CREATED', aggregateType: 'TENANT', aggregateId: 'tenant-reliability-success', correlationId: 'correlation-success', payload: {}, status: 'PENDING', createdAt: now });
    });

    const counts = await env.D1_DATABASE.batch([
      env.D1_DATABASE.prepare('SELECT COUNT(*) AS count FROM tenants WHERE id = ?').bind('tenant-reliability-success'),
      env.D1_DATABASE.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE id = ? AND correlation_id = ?').bind('audit-reliability-success', 'correlation-success'),
      env.D1_DATABASE.prepare("SELECT COUNT(*) AS count FROM outbox_events WHERE id = ? AND status = 'PENDING'").bind('outbox-reliability-success'),
    ]);
    expect(counts.map((result) => (result.results?.[0] as { count: number })?.count)).toEqual([1, 1, 1]);
  });

  it('does not partially commit when a batch statement violates a constraint', async () => {
    await env.D1_DATABASE.prepare('INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, correlation_id, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind('outbox-reliability-failure', 'EXISTING', 'TEST', 'existing', 'correlation', '{}', 'PENDING', now).run();
    const unitOfWork = new D1UnitOfWork(env.D1_DATABASE);

    await expect(unitOfWork.execute(async ({ persistence, outbox }) => {
      persistence.add({ kind: 'D1_SQL', sql: 'INSERT INTO tenants (id, legal_name, display_name, document, timezone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params: ['tenant-reliability-failure', 'Legal', 'Display', 'reliability-failure', 'UTC', 'ACTIVE', now, now] });
      await outbox.append({ id: 'outbox-reliability-failure', type: 'DUPLICATE', aggregateType: 'TEST', aggregateId: 'duplicate', correlationId: 'correlation', payload: {}, status: 'PENDING', createdAt: now });
    })).rejects.toThrow();

    const tenant = await env.D1_DATABASE.prepare('SELECT id FROM tenants WHERE id = ?').bind('tenant-reliability-failure').first();
    expect(tenant).toBeNull();
  });

  it('isolates idempotency keys by tenant and rejects hash conflicts', async () => {
    const store = new D1IdempotencyStore(env.D1_DATABASE);
    const record = { id: 'idempotency-a', tenantId: 'tenant-idem-a', operation: 'RELIABLE_MUTATION', key: 'K', requestHash: 'H', status: 'COMPLETED' as const, response: { ok: true }, createdAt: now, updatedAt: now };
    await store.reserve(record);
    await store.complete(record.tenantId, record.operation, record.key, record.response);
    expect((await store.find('tenant-idem-a', record.operation, 'K'))?.response).toEqual({ ok: true });

    await store.reserve({ ...record, id: 'idempotency-b', tenantId: 'tenant-idem-b' });
    await expect(store.reserve({ ...record, id: 'idempotency-conflict', requestHash: 'H2' })).rejects.toThrow('IDEMPOTENCY_KEY_CONFLICT');
  });
});
