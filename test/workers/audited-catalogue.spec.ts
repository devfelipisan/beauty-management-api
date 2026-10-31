import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { CreateServiceUseCase } from '@beauty/operations/modules/services/application/use-cases';
import { D1ServiceRepository } from '@beauty/operations/modules/services/infrastructure/d1-service-repository';
import { D1UnitOfWork } from '@beauty/reliability/d1/d1-unit-of-work';
import type { UnitOfWork } from '@beauty/reliability/unit-of-work/unit-of-work';

describe('catalogue mutation and audit in physical D1', () => {
  it('rolls back the service if audit persistence fails', async () => {
    const id = crypto.randomUUID();
    const db = env.D1_DATABASE;
    await db
      .prepare(
        "INSERT INTO tenants (id,legal_name,display_name,document,timezone,status,created_at,updated_at) VALUES (?, 'Audit', 'Audit', ?, 'UTC', 'ACTIVE', 'now', 'now')",
      )
      .bind(id, id)
      .run();
    const real = new D1UnitOfWork(db);
    const context = { actorId: 'actor', requestId: id, correlationId: id };
    const input = {
      tenantId: id,
      name: id,
      category: 'GENERAL',
      durationMinutes: 30,
      basePriceCents: 1000,
    };
    await real.execute(async (tx) =>
      tx.audit.append({
        id,
        tenantId: id,
        action: 'fixture',
        resourceType: 'TEST',
        requestId: id,
        correlationId: id,
        occurredAt: 'now',
      }),
    );
    const failing: UnitOfWork = {
      execute: (operation) =>
        real.execute((tx) =>
          operation({
            ...tx,
            audit: { append: (event) => tx.audit.append({ ...event, id }) },
          }),
        ),
    };
    await expect(
      new CreateServiceUseCase(
        new D1ServiceRepository(db),
        false,
        failing,
      ).execute(input, context),
    ).rejects.toThrow();
    expect(
      (
        await db
          .prepare('SELECT COUNT(*) AS count FROM services WHERE tenant_id=?')
          .bind(id)
          .first<{ count: number }>()
      )?.count,
    ).toBe(0);
    const created = await new CreateServiceUseCase(
      new D1ServiceRepository(db),
      false,
      real,
    ).execute(input, context);
    expect(
      await db
        .prepare(
          'SELECT actor_id,action,metadata_json FROM audit_events WHERE tenant_id=? AND resource_id=?',
        )
        .bind(id, created.id)
        .first(),
    ).toEqual({
      actor_id: 'actor',
      action: 'service.created',
      metadata_json: null,
    });
  });
});
