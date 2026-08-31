import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

type Billing = { applyPackageConsumptionRequested(input: Record<string, unknown>): Promise<Record<string, unknown>> };
const db = env.D1_DATABASE;
const billing = env.BILLING_SERVICE as unknown as Billing;
const run = crypto.randomUUID();
const ids = { tenant: `uow-tenant-${run}`, customer: `uow-customer-${run}`, service: `uow-service-${run}`, package: `uow-package-${run}`, session: `uow-session-${run}` };

async function seed() {
  const at = '2029-01-01T00:00:00.000Z';
  await db.batch([
    db.prepare("INSERT INTO tenants (id,legal_name,display_name,document,timezone,status,created_at,updated_at) VALUES (?, 'UOW Tenant','UOW',?,'America/Sao_Paulo','ACTIVE',?,?)").bind(ids.tenant, `4${run.replaceAll('-', '').slice(0, 13)}`, at, at),
    db.prepare("INSERT INTO customers (id,tenant_id,full_name,status,relationship_profile,blocked_for_new_appointments,created_at,updated_at) VALUES (?,?,'UOW Customer','ACTIVE','NEW',0,?,?)").bind(ids.customer, ids.tenant, at, at),
    db.prepare("INSERT INTO services (id,tenant_id,name,category,duration_minutes,base_price_cents,status,created_at,updated_at) VALUES (?,?,'UOW Service','GENERAL',60,10000,'ACTIVE',?,?)").bind(ids.service, ids.tenant, at, at),
    db.prepare("INSERT INTO customer_packages (id,tenant_id,customer_id,service_id,total_quantity,remaining_quantity,base_price_cents,discount_cents,final_price_cents,purchased_at,valid_until,status,created_at,updated_at) VALUES (?,?,?, ?,1,1,10000,0,10000,?,'2030-01-01T00:00:00.000Z','ACTIVE',?,?)").bind(ids.package, ids.tenant, ids.customer, ids.service, at, at, at),
    db.prepare("INSERT INTO package_movements (id,tenant_id,customer_package_id,customer_id,type,quantity,balance_before,balance_after,session_id,appointment_id,source_event_id,occurred_at,created_by) VALUES (?,?,?,?,'CONSUMPTION',1,1,0,?,?,?,?,'TEST')").bind(`existing-movement-${run}`, ids.tenant, ids.package, ids.customer, ids.session, `appointment-${run}`, `existing-event-${run}`, at),
  ]);
}

describe('Package UnitOfWork failure safety', () => {
  beforeAll(seed);

  it('rolls back the package, audit, outbox and idempotency when movement persistence fails', async () => {
    const result = await Promise.allSettled([billing.applyPackageConsumptionRequested({ tenantId: ids.tenant, customerPackageId: ids.package, customerId: ids.customer, serviceId: ids.service, sessionId: ids.session, appointmentId: `appointment-${run}`, completedAt: '2029-01-01T00:00:00.000Z', correlationId: run, eventId: `failed-event-${run}` })]);
    expect(result[0].status).toBe('rejected');
    expect((await db.prepare('SELECT remaining_quantity,status FROM customer_packages WHERE tenant_id = ? AND id = ?').bind(ids.tenant, ids.package).first<{ remaining_quantity: number; status: string }>())).toMatchObject({ remaining_quantity: 1, status: 'ACTIVE' });
    expect((await db.prepare('SELECT COUNT(*) AS count FROM package_movements WHERE tenant_id = ? AND customer_package_id = ?').bind(ids.tenant, ids.package).first<{ count: number }>())?.count).toBe(1);
    expect((await db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE tenant_id = ? AND resource_id = ? AND action = 'package.unit.consumed'").bind(ids.tenant, ids.package).first<{ count: number }>())?.count).toBe(0);
    expect((await db.prepare("SELECT COUNT(*) AS count FROM outbox_events WHERE tenant_id = ? AND aggregate_id = ? AND event_type = 'PackageUnitConsumed'").bind(ids.tenant, ids.package).first<{ count: number }>())?.count).toBe(0);
    expect((await db.prepare("SELECT COUNT(*) AS count FROM idempotency_records WHERE tenant_id = ? AND operation = 'APPLY_PACKAGE_CONSUMPTION' AND idempotency_key = ?").bind(ids.tenant, `failed-event-${run}`).first<{ count: number }>())?.count).toBe(0);
  });
});
