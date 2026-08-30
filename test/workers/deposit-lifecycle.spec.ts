import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

type BillingService = {
  createDepositForAppointment(input: Record<string, unknown>): Promise<{ id: string; status: string; amountCents: number }>;
  confirmDeposit(input: Record<string, unknown>): Promise<{ deposit: { status: string }; appointmentPropagation: string }>;
  expireDeposit(input: Record<string, unknown>): Promise<{ deposit: { status: string }; appointmentPropagation: string }>;
  dispatchOutboxBatch(input: { workerId: string; batchSize: number; leaseSeconds: number; now: string }): Promise<{ sent: number }>;
};

const db = env.D1_DATABASE;
const billing = env.BILLING_SERVICE as unknown as BillingService;
const run = crypto.randomUUID();
const tenantId = `deposit-tenant-${run}`;

async function seedAppointment(id: string, status = 'AWAITING_DEPOSIT') {
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO tenants (id, legal_name, display_name, document, timezone, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'America/Sao_Paulo', 'ACTIVE', ?, ?)").bind(tenantId, 'Deposit Tenant', 'Deposit', `9${run.replaceAll('-', '').slice(0, 13)}`, '2028-01-01', '2028-01-01'),
    db.prepare("INSERT INTO customers (id, tenant_id, full_name, status, relationship_profile, blocked_for_new_appointments, created_at, updated_at) VALUES (?, ?, 'Deposit Customer', 'ACTIVE', 'NEW', 0, ?, ?)").bind(`customer-${id}`, tenantId, '2028-01-01', '2028-01-01'),
    db.prepare("INSERT INTO services (id, tenant_id, name, category, duration_minutes, base_price_cents, status, requires_assessment, allows_discount, deposit_mode, created_at, updated_at) VALUES (?, ?, 'Deposit Service', 'GENERAL', 60, 10000, 'ACTIVE', 0, 0, 'FIXED', ?, ?)").bind(`service-${id}`, tenantId, '2028-01-01', '2028-01-01'),
    db.prepare("INSERT INTO professionals (id, tenant_id, name, status, public_visible, created_at, updated_at) VALUES (?, ?, 'Deposit Professional', 'ACTIVE', 1, ?, ?)").bind(`professional-${id}`, tenantId, '2028-01-01', '2028-01-01'),
    db.prepare('INSERT INTO appointments (id, tenant_id, customer_id, service_id, professional_id, starts_at, ends_at, duration_minutes, base_price_cents, discount_cents, final_price_cents, deposit_cents, origin, status, created_at, updated_at, deposit_required, deposit_mode) VALUES (?, ?, ?, ?, ?, ?, ?, 60, 10000, 0, 10000, 3600, \'RECEPTION\', ?, ?, ?, 1, \'FIXED\')').bind(id, tenantId, `customer-${id}`, `service-${id}`, `professional-${id}`, '2028-04-10T09:00:00.000Z', '2028-04-10T10:00:00.000Z', status, '2028-01-01', '2028-01-01'),
  ]);
}

describe('Deposit lifecycle through Billing and Operations service bindings', () => {
  it('creates, confirms and propagates the appointment transition atomically', async () => {
    const appointmentId = `appointment-${run}`;
    await seedAppointment(appointmentId);
    const created = await billing.createDepositForAppointment({ tenantId, appointmentId, amountCents: 3600, depositRequired: true, idempotencyKey: `create-${run}`, correlationId: `correlation-${run}` });
    expect(created).toMatchObject({ amountCents: 3600, status: 'PENDING' });

    const confirmed = await billing.confirmDeposit({ tenantId, depositId: created.id, idempotencyKey: `confirm-${run}`, correlationId: `correlation-${run}` });
    expect(confirmed).toMatchObject({ deposit: { status: 'CONFIRMED' }, appointmentPropagation: 'APPLIED' });
    expect((await db.prepare('SELECT status FROM appointments WHERE tenant_id = ? AND id = ?').bind(tenantId, appointmentId).first<{ status: string }>())?.status).toBe('AWAITING_CONFIRMATION');
    expect(await billing.dispatchOutboxBatch({ workerId: `dispatcher-${run}`, batchSize: 10, leaseSeconds: 60, now: '2028-01-01T00:00:00.000Z' })).toMatchObject({ sent: 1 });
    expect((await db.prepare("SELECT status, attempt_count FROM outbox_events WHERE aggregate_id = ? AND event_type = 'DepositConfirmed'").bind(created.id).first<{ status: string; attempt_count: number }>())).toMatchObject({ status: 'SENT', attempt_count: 1 });
  });

  it('expires only when due and keeps the lifecycle idempotent', async () => {
    const appointmentId = `appointment-expire-${run}`;
    await seedAppointment(appointmentId);
    const created = await billing.createDepositForAppointment({ tenantId, appointmentId, amountCents: 3600, depositRequired: true, expiresAt: '2020-01-01T00:00:00.000Z', idempotencyKey: `create-expire-${run}`, correlationId: `correlation-expire-${run}` });
    const expired = await billing.expireDeposit({ tenantId, depositId: created.id, idempotencyKey: `expire-${run}`, correlationId: `correlation-expire-${run}` });
    expect(expired).toMatchObject({ deposit: { status: 'EXPIRED' }, appointmentPropagation: 'APPLIED' });
    const replay = await billing.expireDeposit({ tenantId, depositId: created.id, idempotencyKey: `expire-${run}`, correlationId: `correlation-expire-${run}` });
    expect(replay).toEqual(expired);
  });
});
