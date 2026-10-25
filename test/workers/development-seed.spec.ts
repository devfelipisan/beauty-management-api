import { env, exports } from 'cloudflare:workers';
import { buildDevelopmentSeed } from '../../database/seeds/development.mjs';

type Worker = {
  fetch(request: Request): Promise<Response>;
  dispatchOutboxBatch(input: Record<string, unknown>): Promise<unknown>;
};
const operations = exports.default as Worker;
const clinical = env.CLINICAL_SERVICE as unknown as Worker;
const billing = env.BILLING_SERVICE as unknown as Worker & {
  issueRefund(input: Record<string, unknown>): Promise<unknown>;
};
const db = env.D1_DATABASE;
const seed = buildDevelopmentSeed();
const tenantId = seed.manifest.tenantId;
const apply = () => db.batch(seed.statements.map((sql) => db.prepare(sql)));
const request = (
  worker: Worker,
  path: string,
  method = 'GET',
  body?: unknown,
  key?: string,
) =>
  worker.fetch(
    new Request(`https://seed.test${path}`, {
      method,
      headers: {
        authorization: 'Bearer actor-dev-admin',
        'content-type': 'application/json',
        ...(key
          ? {
              'Idempotency-Key': key,
              'x-request-id': key,
              'x-correlation-id': key,
            }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
const dispatch = (worker: Worker, name: string) =>
  worker.dispatchOutboxBatch({
    workerId: `seed-${name}`,
    batchSize: 100,
    leaseSeconds: 60,
  });

describe('Development seed on physical D1 and Workers', () => {
  beforeAll(apply);

  it('creates only valid catalog fixtures, with repeatable IDs and no fabricated transactions', async () => {
    await apply();
    expect(
      (
        await db
          .prepare('SELECT COUNT(*) AS count FROM customers WHERE tenant_id=?')
          .bind(tenantId)
          .first<{ count: number }>()
      )?.count,
    ).toBe(13);
    expect(
      (
        await db
          .prepare('SELECT COUNT(*) AS count FROM services WHERE tenant_id=?')
          .bind(tenantId)
          .first<{ count: number }>()
      )?.count,
    ).toBe(6);
    for (const table of [
      'appointments',
      'sessions',
      'payments',
      'audit_events',
      'outbox_events',
    ]) {
      expect(
        (
          await db
            .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE tenant_id=?`)
            .bind(tenantId)
            .first<{ count: number }>()
        )?.count,
      ).toBe(0);
    }
    expect(await db.prepare('PRAGMA foreign_key_check').all()).toMatchObject({
      results: [],
    });
    expect(
      (await request(operations, '/tenants/tenant-other/services')).status,
    ).toBe(403);
    expect(
      (
        await request(
          operations,
          `/tenants/${tenantId}/services/mock-service-outro-tenant`,
        )
      ).status,
    ).toBe(404);
  });

  it('qualifies all manifest scenarios and idempotent appointment replay against current runtime behavior', async () => {
    for (const scenario of seed.manifest.scenarios) {
      const response = await request(
        operations,
        scenario.path,
        scenario.method,
        scenario.body,
        scenario.headers['Idempotency-Key'],
      );
      expect(response.status, scenario.id).toBe(scenario.expected.status);
      const payload = (await response.json()) as {
        code?: string;
        data?: Record<string, unknown>;
      };
      if (scenario.expected.code)
        expect(payload.code, scenario.id).toBe(scenario.expected.code);
      if (scenario.expected.status === 201) {
        const replay = await request(
          operations,
          scenario.path,
          scenario.method,
          scenario.body,
          scenario.headers['Idempotency-Key'],
        );
        expect(await replay.json()).toMatchObject({ data: payload.data });
        if (scenario.id === 'desconto')
          expect(payload.data).toMatchObject({
            basePriceCents: 20000,
            discountCents: 2000,
            finalPriceCents: 18000,
          });
        if (scenario.id === 'sinal')
          expect(payload.data).toMatchObject({
            depositRequired: true,
            depositCents: 5000,
            status: 'AWAITING_DEPOSIT',
          });
      }
    }
    const original = seed.manifest.scenarios[0];
    const sameSlot = await request(
      operations,
      original.path,
      'POST',
      original.body,
      'mock-test-time-conflict',
    );
    expect(sameSlot.status).toBe(409);
    expect(await sameSlot.json()).toMatchObject({ code: 'TIME_CONFLICT' });
  });

  it('generates session, history, receivable, payments and refund through real transactional flows', async () => {
    const startsAt = new Date(
      Date.parse(`${seed.manifest.referenceDate}T12:00:00.000Z`) +
        40 * 86400000,
    ).toISOString();
    const created = await request(
      operations,
      `/tenants/${tenantId}/appointments`,
      'POST',
      { ...seed.manifest.scenarios[0].body, startsAt },
      'mock-flow-create',
    );
    expect(created.status).toBe(201);
    const appointmentId = ((await created.json()) as { data: { id: string } })
      .data.id;
    for (const action of ['confirm', 'check-in'])
      expect(
        (
          await request(
            operations,
            `/tenants/${tenantId}/appointments/${appointmentId}/${action}`,
            'POST',
            {},
            `mock-flow-${action}`,
          )
        ).status,
      ).toBe(200);
    const started = await request(
      clinical,
      `/tenants/${tenantId}/appointments/${appointmentId}/session/start`,
      'POST',
      {},
      'mock-flow-start',
    );
    expect(started.status).toBe(201);
    const sessionId = ((await started.json()) as { data: { id: string } }).data
      .id;
    await dispatch(clinical, 'started');
    expect(
      (
        await request(
          clinical,
          `/tenants/${tenantId}/sessions/${sessionId}/complete`,
          'POST',
          {},
          'mock-flow-complete',
        )
      ).status,
    ).toBe(200);
    await dispatch(clinical, 'completed');
    await dispatch(operations, 'settlement');
    const receivable = await db
      .prepare(
        "SELECT id,net_amount_cents FROM receivables WHERE tenant_id=? AND source_type='APPOINTMENT' AND source_id=?",
      )
      .bind(tenantId, appointmentId)
      .first<{ id: string; net_amount_cents: number }>();
    expect(receivable?.net_amount_cents).toBe(20000);
    const paymentPath = `/tenants/${tenantId}/receivables/${receivable!.id}/payments`;
    // Existing divergence: optional customerId reaches a NOT NULL SQL binding.
    const missingCustomer = await request(
      billing,
      paymentPath,
      'POST',
      { amountCents: 6000, method: 'PIX' },
      'mock-flow-missing-customer',
    );
    expect(missingCustomer.status).toBe(500);
    expect(
      (
        await db
          .prepare(
            'SELECT COUNT(*) AS count FROM payments WHERE tenant_id=? AND receivable_id=?',
          )
          .bind(tenantId, receivable!.id)
          .first<{ count: number }>()
      )?.count,
    ).toBe(0);
    const partial = await request(
      billing,
      paymentPath,
      'POST',
      { customerId: 'mock-customer-maria', amountCents: 6000, method: 'PIX' },
      'mock-flow-partial',
    );
    expect(partial.status).toBe(201);
    const payment = (await partial.json()) as { data: { paymentId: string } };
    expect(payment.data).toMatchObject({
      paidAmountCents: 6000,
      outstandingAmountCents: 14000,
      status: 'PARTIALLY_PAID',
    });
    expect(
      await (
        await request(
          billing,
          paymentPath,
          'POST',
          {
            customerId: 'mock-customer-maria',
            amountCents: 6000,
            method: 'PIX',
          },
          'mock-flow-partial',
        )
      ).json(),
    ).toMatchObject(payment);
    const newTraceReplay = await billing.fetch(
      new Request(`https://seed.test${paymentPath}`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer actor-dev-admin',
          'content-type': 'application/json',
          'Idempotency-Key': 'mock-flow-partial',
        },
        body: JSON.stringify({
          customerId: 'mock-customer-maria',
          amountCents: 6000,
          method: 'PIX',
        }),
      }),
    );
    expect(newTraceReplay.status).toBe(409);
    expect(await newTraceReplay.json()).toMatchObject({
      code: 'IDEMPOTENCY_KEY_CONFLICT',
    });
    expect(
      await (
        await request(
          billing,
          paymentPath,
          'POST',
          {
            customerId: 'mock-customer-maria',
            amountCents: 14000,
            method: 'CREDIT_CARD',
          },
          'mock-flow-total',
        )
      ).json(),
    ).toMatchObject({ data: { status: 'PAID', outstandingAmountCents: 0 } });
    const paidReplay = await request(
      billing,
      paymentPath,
      'POST',
      {
        customerId: 'mock-customer-maria',
        amountCents: 14000,
        method: 'CREDIT_CARD',
      },
      'mock-flow-total',
    );
    expect(paidReplay.status).toBe(500);
    expect(await paidReplay.json()).toMatchObject({
      code: 'RECEIVABLE_ALREADY_PAID',
    });
    const refundInput = {
      tenantId,
      paymentId: payment.data.paymentId,
      amountCents: 2000,
      actorId: 'actor-dev-admin',
      idempotencyKey: 'mock-flow-refund',
      requestId: 'mock-flow-refund',
      correlationId: 'mock-flow-refund',
    };
    const refund = await billing.issueRefund(refundInput);
    expect(refund).toMatchObject({ amountCents: 2000, status: 'CONFIRMED' });
    expect(await billing.issueRefund(refundInput)).toEqual(refund);
    expect(
      (
        await db
          .prepare(
            'SELECT COUNT(*) AS count FROM payments WHERE tenant_id=? AND receivable_id=?',
          )
          .bind(tenantId, receivable!.id)
          .first<{ count: number }>()
      )?.count,
    ).toBe(2);
    expect(
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS count FROM ledger_movements WHERE tenant_id=? AND receivable_id=? AND type='REFUND_ISSUED'",
          )
          .bind(tenantId, receivable!.id)
          .first<{ count: number }>()
      )?.count,
    ).toBe(1);
    await request(
      operations,
      `/tenants/${tenantId}/services/mock-service-consulta`,
      'PATCH',
      { basePriceCents: 36000 },
    );
    await apply();
    expect(
      (
        await db
          .prepare(
            'SELECT base_price_cents FROM services WHERE tenant_id=? AND id=?',
          )
          .bind(tenantId, 'mock-service-consulta')
          .first<{ base_price_cents: number }>()
      )?.base_price_cents,
    ).toBe(36000);
    expect(
      await db
        .prepare(
          'SELECT final_price_cents,status FROM appointments WHERE tenant_id=? AND id=?',
        )
        .bind(tenantId, appointmentId)
        .first(),
    ).toEqual({ final_price_cents: 20000, status: 'COMPLETED' });
  });

  it('does not supersede an existing tenant license', async () => {
    await db
      .prepare("DELETE FROM licenses WHERE tenant_id='tenant-dev-001'")
      .run();
    await db
      .prepare(
        "INSERT INTO licenses (id,tenant_id,plan_id,starts_at,status,limits_json,enabled_resources_json) VALUES ('existing-license','tenant-dev-001','existing-plan','2020-01-01','SUSPENDED','{}','[]')",
      )
      .run();
    await apply();
    expect(
      await db
        .prepare(
          "SELECT id,status FROM licenses WHERE tenant_id='tenant-dev-001'",
        )
        .all(),
    ).toMatchObject({
      results: [{ id: 'existing-license', status: 'SUSPENDED' }],
    });
  });

  it('rolls back the batch on failure and refuses fixture IDs belonging to another tenant', async () => {
    await expect(
      db.batch([
        ...seed.statements.map((sql) => db.prepare(sql)),
        db.prepare(
          "INSERT INTO customers (id,tenant_id,full_name,status,relationship_profile,created_at,updated_at) VALUES ('mock-rollback','tenant-dev-001','Rollback','ACTIVE','NEW','2026-01-01','2026-01-01')",
        ),
        db.prepare(
          "INSERT INTO customers (id,tenant_id,full_name,status,relationship_profile,created_at,updated_at) VALUES ('mock-invalid','tenant-does-not-exist','Invalid','ACTIVE','NEW','2026-01-01','2026-01-01')",
        ),
      ]),
    ).rejects.toThrow();
    expect(
      await db
        .prepare("SELECT id FROM customers WHERE id='mock-rollback'")
        .first(),
    ).toBeNull();
    await db
      .prepare(
        "UPDATE customers SET tenant_id='tenant-other' WHERE id='mock-customer-bloqueado'",
      )
      .run();
    await expect(apply()).rejects.toThrow();
    expect(
      await db
        .prepare(
          "SELECT tenant_id FROM customers WHERE id='mock-customer-bloqueado'",
        )
        .first(),
    ).toEqual({ tenant_id: 'tenant-other' });
  });
});
