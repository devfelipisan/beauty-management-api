import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { D1AppointmentRepository } from '../../apps/operations-worker/src/appointments/adapters/d1-appointment-repository.js';
import { Appointment, AppointmentOrigin, AppointmentStatus } from '../../apps/operations-worker/src/appointments/domain/appointment.js';

const repository = new D1AppointmentRepository(env.D1_DATABASE);

async function seed(tenantId: string, suffix: string) {
  await env.D1_DATABASE.batch([
    env.D1_DATABASE.prepare('INSERT INTO tenants (id, legal_name, display_name, document, timezone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(tenantId, tenantId, tenantId, `doc-${suffix}`, 'America/Sao_Paulo', 'ACTIVE', 'now', 'now'),
    env.D1_DATABASE.prepare('INSERT INTO professionals (id, tenant_id, name, status, public_visible, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(`professional-${suffix}`, tenantId, 'Professional', 'ACTIVE', 1, 'now', 'now'),
    env.D1_DATABASE.prepare('INSERT INTO services (id, tenant_id, name, category, duration_minutes, base_price_cents, status, created_at, updated_at, requires_assessment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(`service-${suffix}`, tenantId, 'Service', 'GENERAL', 60, 1000, 'ACTIVE', 'now', 'now', 0),
    env.D1_DATABASE.prepare('INSERT INTO customers (id, tenant_id, full_name, status, relationship_profile, blocked_for_new_appointments, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(`customer-a-${suffix}`, tenantId, 'Customer A', 'ACTIVE', 'NEW', 0, 'now', 'now'),
    env.D1_DATABASE.prepare('INSERT INTO customers (id, tenant_id, full_name, status, relationship_profile, blocked_for_new_appointments, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(`customer-b-${suffix}`, tenantId, 'Customer B', 'ACTIVE', 'NEW', 0, 'now', 'now'),
  ]);
}

async function reserve(tenantId: string, suffix: string, customer: 'a' | 'b', startsAt: string, durationMinutes = 60) {
  const appointment = Appointment.create(`appointment-${suffix}-${customer}-${startsAt}`, {
    tenantId, customerId: `customer-${customer}-${suffix}`, serviceId: `service-${suffix}`, professionalId: `professional-${suffix}`,
    startsAt, durationMinutes, origin: AppointmentOrigin.MANUAL, status: AppointmentStatus.CONFIRMED,
  });
  const commands: Array<{ sql: string; params: unknown[] }> = [];
  await repository.reserve(appointment, { add: (command) => commands.push(command) });
  const result = await env.D1_DATABASE.batch(commands.map((command) => env.D1_DATABASE.prepare(command.sql).bind(...command.params)));
  return (result[0] as { meta?: { changes?: number } }).meta?.changes ?? 0;
}

describe('physical D1 scheduling reservation', () => {
  it('allows adjacent intervals and rejects partial overlap', async () => {
    await seed('tenant-scheduling-basic', 'basic');
    expect(await reserve('tenant-scheduling-basic', 'basic', 'a', '2026-09-01T09:00:00.000Z')).toBe(1);
    expect(await reserve('tenant-scheduling-basic', 'basic', 'b', '2026-09-01T10:00:00.000Z')).toBe(1);
    expect(await reserve('tenant-scheduling-basic', 'basic', 'a', '2026-09-01T09:30:00.000Z')).toBe(0);
  });

  it('keeps the same slot independent across tenants', async () => {
    await seed('tenant-scheduling-a', 'tenant-a');
    await seed('tenant-scheduling-b', 'tenant-b');
    const results = await Promise.all([
      reserve('tenant-scheduling-a', 'tenant-a', 'a', '2026-09-02T09:00:00.000Z'),
      reserve('tenant-scheduling-b', 'tenant-b', 'a', '2026-09-02T09:00:00.000Z'),
    ]);
    expect(results).toEqual([1, 1]);
  });

  it('produces one winner and one conflict under repeated contention', async () => {
    let successes = 0;
    let conflicts = 0;
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const suffix = `contention-${iteration}`;
      const tenantId = `tenant-${suffix}`;
      await seed(tenantId, suffix);
      const results = await Promise.all([
        reserve(tenantId, suffix, 'a', `2026-09-${String(3 + iteration).padStart(2, '0')}T09:00:00.000Z`),
        reserve(tenantId, suffix, 'b', `2026-09-${String(3 + iteration).padStart(2, '0')}T09:00:00.000Z`),
      ]);
      successes += results.filter((changes) => changes === 1).length;
      conflicts += results.filter((changes) => changes === 0).length;
      expect(results.sort()).toEqual([0, 1]);
      const count = await env.D1_DATABASE.prepare('SELECT COUNT(*) AS count FROM appointments WHERE tenant_id = ?').bind(tenantId).first<{ count: number }>();
      expect(count?.count).toBe(1);
    }
    expect({ iterations: 20, attempts: 40, successes, conflicts, doubleBookings: 0 }).toEqual({ iterations: 20, attempts: 40, successes: 20, conflicts: 20, doubleBookings: 0 });
  });
});
