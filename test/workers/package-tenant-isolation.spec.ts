import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

type Billing = {
  checkPackageUsageEligibility(input: Record<string, unknown>): Promise<Record<string, unknown>>;
  applyPackageConsumptionRequested(input: Record<string, unknown>): Promise<Record<string, unknown>>;
};
const db = env.D1_DATABASE;
const billing = env.BILLING_SERVICE as unknown as Billing;
const run = crypto.randomUUID();
const tenantA = `isolation-a-${run}`;
const tenantB = `isolation-b-${run}`;
const customerA = `isolation-customer-a-${run}`;
const customerB = `isolation-customer-b-${run}`;
const service = `isolation-service-${run}`;
const packageA = `isolation-package-a-${run}`;
const packageB = `isolation-package-b-${run}`;

async function seed() {
  const timestamp = '2029-01-01T00:00:00.000Z';
  await db.batch([
    db.prepare("INSERT INTO tenants (id,legal_name,display_name,document,timezone,status,created_at,updated_at) VALUES (?, 'Isolation A','A',?,'America/Sao_Paulo','ACTIVE',?,?)").bind(tenantA, `6${run.replaceAll('-', '').slice(0, 13)}1`, timestamp, timestamp),
    db.prepare("INSERT INTO tenants (id,legal_name,display_name,document,timezone,status,created_at,updated_at) VALUES (?, 'Isolation B','B',?,'America/Sao_Paulo','ACTIVE',?,?)").bind(tenantB, `6${run.replaceAll('-', '').slice(0, 13)}2`, timestamp, timestamp),
    db.prepare("INSERT INTO customers (id,tenant_id,full_name,status,relationship_profile,blocked_for_new_appointments,created_at,updated_at) VALUES (?,?,'A','ACTIVE','NEW',0,?,?)").bind(customerA, tenantA, timestamp, timestamp),
    db.prepare("INSERT INTO customers (id,tenant_id,full_name,status,relationship_profile,blocked_for_new_appointments,created_at,updated_at) VALUES (?,?,'B','ACTIVE','NEW',0,?,?)").bind(customerB, tenantB, timestamp, timestamp),
    db.prepare("INSERT INTO services (id,tenant_id,name,category,duration_minutes,base_price_cents,status,created_at,updated_at) VALUES (?,?,'A','GENERAL',60,10000,'ACTIVE',?,?)").bind(service, tenantA, timestamp, timestamp),
    db.prepare("INSERT INTO customer_packages (id,tenant_id,customer_id,service_id,total_quantity,remaining_quantity,base_price_cents,discount_cents,final_price_cents,purchased_at,valid_until,status,created_at,updated_at) VALUES (?,?,?, ?,1,1,10000,0,10000,?,'2030-01-01T00:00:00.000Z','ACTIVE',?,?)").bind(packageA, tenantA, customerA, service, timestamp, timestamp, timestamp),
    db.prepare("INSERT INTO customer_packages (id,tenant_id,customer_id,service_id,total_quantity,remaining_quantity,base_price_cents,discount_cents,final_price_cents,purchased_at,valid_until,status,created_at,updated_at) VALUES (?,?,?, ?,1,1,10000,0,10000,?,'2030-01-01T00:00:00.000Z','ACTIVE',?,?)").bind(packageB, tenantB, customerB, service, timestamp, timestamp, timestamp),
  ]);
}

describe('Package tenant isolation physical qualification', () => {
  beforeAll(seed);

  it('blocks eligibility and consumption across tenants', async () => {
    await expect(billing.checkPackageUsageEligibility({ tenantId: tenantA, customerPackageId: packageB, customerId: customerA, serviceId: service, correlationId: run })).resolves.toMatchObject({ status: 'BLOCKED', reason: 'PACKAGE_NOT_FOUND' });
    const result = await Promise.allSettled([billing.applyPackageConsumptionRequested({ tenantId: tenantA, customerPackageId: packageB, customerId: customerA, serviceId: service, sessionId: `shared-session-${run}`, appointmentId: `shared-appointment-${run}`, completedAt: '2029-01-01T00:00:00.000Z', correlationId: run, eventId: `cross-tenant-${run}` })]);
    expect(result[0].status).toBe('rejected');
    expect((await db.prepare('SELECT remaining_quantity FROM customer_packages WHERE tenant_id = ? AND id = ?').bind(tenantB, packageB).first<{ remaining_quantity: number }>())?.remaining_quantity).toBe(1);
    expect((await db.prepare('SELECT COUNT(*) AS count FROM package_movements WHERE tenant_id = ? AND customer_package_id = ?').bind(tenantA, packageB).first<{ count: number }>())?.count ?? 0).toBe(0);
  });

  it('allows equal session ids independently when tenant_id differs', async () => {
    const sessionId = `same-session-${run}`;
    await billing.applyPackageConsumptionRequested({ tenantId: tenantA, customerPackageId: packageA, customerId: customerA, serviceId: service, sessionId, appointmentId: `appointment-a-${run}`, completedAt: '2029-01-01T00:00:00.000Z', correlationId: run, eventId: `event-a-${run}` });
    await billing.applyPackageConsumptionRequested({ tenantId: tenantB, customerPackageId: packageB, customerId: customerB, serviceId: service, sessionId, appointmentId: `appointment-b-${run}`, completedAt: '2029-01-01T00:00:00.000Z', correlationId: run, eventId: `event-b-${run}` });
    expect((await db.prepare('SELECT COUNT(*) AS count FROM package_movements WHERE session_id = ? AND type = \'CONSUMPTION\'').bind(sessionId).first<{ count: number }>())?.count).toBe(2);
  });
});
