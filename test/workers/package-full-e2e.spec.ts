import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

type Clinical = { completeSession(input: Record<string, unknown>): Promise<Record<string, unknown>>; dispatchOutboxBatch(input: Record<string, unknown>): Promise<Record<string, unknown>> };
type Billing = { dispatchOutboxBatch(input: Record<string, unknown>): Promise<Record<string, unknown>> };
const db = env.D1_DATABASE;
const clinical = env.CLINICAL_SERVICE as unknown as Clinical;
const billing = env.BILLING_SERVICE as unknown as Billing;
const run = crypto.randomUUID();
const ids = { tenant: `e2e-tenant-${run}`, customer: `e2e-customer-${run}`, service: `e2e-service-${run}`, professional: `e2e-professional-${run}`, appointment: `e2e-appointment-${run}`, session: `e2e-session-${run}`, package: `e2e-package-${run}` };

async function seed() {
  const timestamp = '2029-01-01T00:00:00.000Z';
  await db.batch([
    db.prepare("INSERT INTO tenants (id,legal_name,display_name,document,timezone,status,created_at,updated_at) VALUES (?, 'E2E Tenant','E2E',?,'America/Sao_Paulo','ACTIVE',?,?)").bind(ids.tenant, `5${run.replaceAll('-', '').slice(0, 13)}`, timestamp, timestamp),
    db.prepare("INSERT INTO customers (id,tenant_id,full_name,status,relationship_profile,blocked_for_new_appointments,created_at,updated_at) VALUES (?,?,'E2E Customer','ACTIVE','NEW',0,?,?)").bind(ids.customer, ids.tenant, timestamp, timestamp),
    db.prepare("INSERT INTO services (id,tenant_id,name,category,duration_minutes,base_price_cents,status,created_at,updated_at) VALUES (?,?,'E2E Service','GENERAL',60,10000,'ACTIVE',?,?)").bind(ids.service, ids.tenant, timestamp, timestamp),
    db.prepare("INSERT INTO professionals (id,tenant_id,name,status,public_visible,created_at,updated_at) VALUES (?,?,'E2E Professional','ACTIVE',1,?,?)").bind(ids.professional, ids.tenant, timestamp, timestamp),
    db.prepare("INSERT INTO appointments (id,tenant_id,customer_id,service_id,professional_id,starts_at,ends_at,duration_minutes,base_price_cents,discount_cents,final_price_cents,deposit_cents,origin,status,created_at,updated_at,deposit_required,deposit_mode,customer_package_id,settlement_source) VALUES (?,?,?,?,?,'2029-01-01T10:00:00Z','2029-01-01T11:00:00Z',60,10000,0,10000,NULL,'RECEPTION','IN_PROGRESS',?,?,0,'NOT_REQUIRED',?,'PACKAGE')").bind(ids.appointment, ids.tenant, ids.customer, ids.service, ids.professional, timestamp, timestamp, ids.package),
    db.prepare("INSERT INTO customer_packages (id,tenant_id,customer_id,service_id,total_quantity,remaining_quantity,base_price_cents,discount_cents,final_price_cents,purchased_at,valid_until,status,created_at,updated_at) VALUES (?,?,?, ?,3,3,30000,0,30000,?,'2030-01-01T00:00:00.000Z','ACTIVE',?,?)").bind(ids.package, ids.tenant, ids.customer, ids.service, timestamp, timestamp, timestamp),
    db.prepare("INSERT INTO sessions (id,tenant_id,appointment_id,customer_id,service_id,professional_id,status,customer_package_id,started_at,started_by,created_at,updated_at) VALUES (?,?,?,?,? ,?,'IN_PROGRESS',? ,?,?,?,?)").bind(ids.session, ids.tenant, ids.appointment, ids.customer, ids.service, ids.professional, ids.package, timestamp, 'actor-dev-admin', timestamp, timestamp),
  ]);
}

describe('Package full cross-worker E2E', () => {
  beforeAll(seed);

  it('completes the package-funded session and projects both outbox hops', async () => {
    const completed = await clinical.completeSession({ tenantId: ids.tenant, sessionId: ids.session, actorId: 'actor-dev-admin', idempotencyKey: `complete-${run}`, requestId: `request-${run}`, correlationId: `correlation-${run}` });
    expect(completed.status).toBe('COMPLETED');
    expect((await db.prepare("SELECT COUNT(*) AS count FROM outbox_events WHERE tenant_id = ? AND event_type = 'PackageConsumptionRequested' AND aggregate_id = ?").bind(ids.tenant, ids.session).first<{ count: number }>())?.count).toBe(1);
    await clinical.dispatchOutboxBatch({ workerId: `clinical-e2e-${run}`, batchSize: 20, leaseSeconds: 30 });
    await billing.dispatchOutboxBatch({ workerId: `billing-e2e-${run}`, batchSize: 20, leaseSeconds: 30 });
    expect((await db.prepare('SELECT remaining_quantity,status FROM customer_packages WHERE tenant_id = ? AND id = ?').bind(ids.tenant, ids.package).first<{ remaining_quantity: number; status: string }>())).toMatchObject({ remaining_quantity: 2, status: 'ACTIVE' });
    expect((await db.prepare("SELECT COUNT(*) AS count FROM package_movements WHERE tenant_id = ? AND customer_package_id = ? AND type = 'CONSUMPTION'").bind(ids.tenant, ids.package).first<{ count: number }>())?.count).toBe(1);
    expect((await db.prepare("SELECT COUNT(*) AS count FROM customer_timeline_events WHERE tenant_id = ? AND customer_id = ? AND event_type = 'PACKAGE_CONSUMED'").bind(ids.tenant, ids.customer).first<{ count: number }>())?.count).toBe(1);
  });
});
