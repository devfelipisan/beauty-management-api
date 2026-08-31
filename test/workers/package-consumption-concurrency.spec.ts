import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

type Billing = {
  applyPackageConsumptionRequested(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  materializeCustomerPackage(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  dispatchOutboxBatch(input: Record<string, unknown>): Promise<Record<string, unknown>>;
};

const db = env.D1_DATABASE;
const billing = env.BILLING_SERVICE as unknown as Billing;
const run = crypto.randomUUID();
const tenant = `package-tenant-${run}`;
const customer = `package-customer-${run}`;
const service = `package-service-${run}`;
const now = '2029-01-01T00:00:00.000Z';

async function seedTenant() {
  await db.batch([
    db.prepare("INSERT INTO tenants (id,legal_name,display_name,document,timezone,status,created_at,updated_at) VALUES (?, 'Package Tenant', 'Package', ?, 'America/Sao_Paulo', 'ACTIVE', ?, ?)").bind(tenant, `7${run.replaceAll('-', '').slice(0, 13)}`, now, now),
    db.prepare("INSERT INTO customers (id,tenant_id,full_name,status,relationship_profile,blocked_for_new_appointments,created_at,updated_at) VALUES (?,?, 'Package Customer','ACTIVE','NEW',0,?,?)").bind(customer, tenant, now, now),
    db.prepare("INSERT INTO services (id,tenant_id,name,category,duration_minutes,base_price_cents,status,created_at,updated_at) VALUES (?,?, 'Package Service','GENERAL',60,10000,'ACTIVE',?,?)").bind(service, tenant, now, now),
  ]);
}

async function seedPackage(id: string, balance: number, validUntil = '2030-01-01T00:00:00.000Z') {
  await db.prepare("INSERT INTO customer_packages (id,tenant_id,customer_id,service_id,total_quantity,remaining_quantity,base_price_cents,discount_cents,final_price_cents,purchased_at,valid_until,status,created_at,updated_at) VALUES (?,?,?,?,?,?,10000,0,10000,? ,?,'ACTIVE',?,?)").bind(id, tenant, customer, service, balance, balance, now, validUntil, now, now).run();
}

function request(packageId: string, sessionId: string, eventId: string, appointmentId = `appointment-${sessionId}`) {
  return { tenantId: tenant, customerPackageId: packageId, customerId: customer, serviceId: service, sessionId, appointmentId, completedAt: now, correlationId: `correlation-${eventId}`, eventId };
}

async function movementCount(packageId: string) {
  return Number((await db.prepare("SELECT COUNT(*) AS count FROM package_movements WHERE tenant_id = ? AND customer_package_id = ? AND type = 'CONSUMPTION'").bind(tenant, packageId).first<{ count: number }>())?.count ?? 0);
}

describe('Package physical safety qualification', () => {
  beforeAll(seedTenant);

  it('allows one unit under contention and never makes the balance negative', async () => {
    const packageId = `package-${run}-one`;
    await seedPackage(packageId, 1);
    const results = await Promise.allSettled([
      billing.applyPackageConsumptionRequested(request(packageId, `session-${run}-a`, `event-${run}-a`)),
      billing.applyPackageConsumptionRequested(request(packageId, `session-${run}-b`, `event-${run}-b`)),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const row = await db.prepare('SELECT remaining_quantity FROM customer_packages WHERE tenant_id = ? AND id = ?').bind(tenant, packageId).first<{ remaining_quantity: number }>();
    expect(row?.remaining_quantity).toBe(0);
    expect(await movementCount(packageId)).toBe(1);
  });

  it('replays the same event without a second movement and rejects a second event for one session', async () => {
    const packageId = `package-${run}-replay`;
    await seedPackage(packageId, 2);
    const firstRequest = request(packageId, `session-${run}-replay`, `event-${run}-replay`);
    const first = await billing.applyPackageConsumptionRequested(firstRequest);
    const replay = await billing.applyPackageConsumptionRequested(firstRequest);
    expect(replay).toEqual(first);
    let secondEventRejected = false;
    try {
      await billing.applyPackageConsumptionRequested(request(packageId, firstRequest.sessionId, `event-${run}-other`));
    } catch {
      secondEventRejected = true;
    }
    expect(secondEventRejected).toBe(true);
    expect(await movementCount(packageId)).toBe(1);
    expect((await db.prepare('SELECT remaining_quantity FROM customer_packages WHERE tenant_id = ? AND id = ?').bind(tenant, packageId).first<{ remaining_quantity: number }>())?.remaining_quantity).toBe(1);
  });

  it('keeps materialization idempotent for the same source operation', async () => {
    const before = Number((await db.prepare('SELECT COUNT(*) AS count FROM customer_packages WHERE tenant_id = ? AND customer_id = ?').bind(tenant, customer).first<{ count: number }>())?.count ?? 0);
    const input = { tenantId: tenant, customerId: customer, serviceId: service, totalQuantity: 3, basePriceCents: 30000, discountCents: 0, finalPriceCents: 30000, purchasedAt: now, validUntil: '2030-01-01T00:00:00.000Z', sourceOperationId: `source-${run}`, actorId: 'test', idempotencyKey: `materialize-${run}`, requestId: `request-${run}`, correlationId: `correlation-${run}` };
    const first = await billing.materializeCustomerPackage(input);
    const replay = await billing.materializeCustomerPackage(input);
    expect(replay).toEqual(first);
    expect((await db.prepare('SELECT COUNT(*) AS count FROM customer_packages WHERE tenant_id = ? AND customer_id = ?').bind(tenant, customer).first<{ count: number }>())?.count).toBe(before + 1);
  });

  it('reconciles Billing to Operations exactly once after an ACK-loss replay', async () => {
    const packageId = `package-${run}-ack`;
    const sessionId = `session-${run}-ack`;
    await seedPackage(packageId, 1);
    await billing.applyPackageConsumptionRequested(request(packageId, sessionId, `event-${run}-ack`));
    const batch = { workerId: `billing-test-${run}`, batchSize: 10, leaseSeconds: 30 };
    const firstDispatch = await billing.dispatchOutboxBatch({ ...batch, now: '2031-01-01T00:00:00.000Z' });
    await billing.dispatchOutboxBatch({ ...batch, now: '2031-01-01T00:00:00.000Z' });
    expect(firstDispatch.sent).toBeGreaterThanOrEqual(1);
    expect((await db.prepare("SELECT COUNT(*) AS count FROM customer_timeline_events WHERE tenant_id = ? AND source_aggregate_id = ? AND event_type = 'PACKAGE_CONSUMED'").bind(tenant, packageId).first<{ count: number }>())?.count).toBe(1);
    expect((await db.prepare("SELECT status FROM outbox_events WHERE tenant_id = ? AND aggregate_id = ? AND event_type = 'PackageUnitConsumed'").bind(tenant, packageId).first<{ status: string }>())?.status).toBe('SENT');
  });
});
