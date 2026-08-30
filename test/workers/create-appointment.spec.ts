import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

const worker = exports.default as { fetch(request: Request): Promise<Response> };
const tenantId = 'tenant-dev-001';
const run = crypto.randomUUID();
const fixture = { customerId: `appointment-customer-${run}`, serviceId: `appointment-service-${run}`, professionalId: `appointment-professional-${run}` };
const startsAt = '2028-04-10T09:00:00.000Z';

async function seed() {
  await env.D1_DATABASE.batch([
    env.D1_DATABASE.prepare("INSERT OR IGNORE INTO tenants (id, legal_name, display_name, document, timezone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)").bind(tenantId, 'Development Tenant', 'Development', `999${run.replaceAll('-', '').slice(0, 11)}`, 'America/Sao_Paulo', '2026-01-01', '2026-01-01'),
    env.D1_DATABASE.prepare("INSERT INTO customers (id, tenant_id, full_name, status, relationship_profile, blocked_for_new_appointments, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', 'NEW', 0, ?, ?)").bind(fixture.customerId, tenantId, 'Appointment Customer', '2028-01-01', '2028-01-01'),
    env.D1_DATABASE.prepare("INSERT INTO services (id, tenant_id, name, category, duration_minutes, base_price_cents, status, requires_assessment, allows_discount, deposit_mode, created_at, updated_at) VALUES (?, ?, ?, 'GENERAL', 60, 20000, 'ACTIVE', 0, 0, 'NOT_REQUIRED', ?, ?)").bind(fixture.serviceId, tenantId, 'Appointment Service', '2028-01-01', '2028-01-01'),
    env.D1_DATABASE.prepare("INSERT INTO professionals (id, tenant_id, name, status, public_visible, created_at, updated_at) VALUES (?, ?, ?, 'ACTIVE', 1, ?, ?)").bind(fixture.professionalId, tenantId, 'Appointment Professional', '2028-01-01', '2028-01-01'),
    env.D1_DATABASE.prepare('INSERT INTO professional_services (tenant_id, professional_id, service_id, created_at) VALUES (?, ?, ?, ?)').bind(tenantId, fixture.professionalId, fixture.serviceId, '2028-01-01'),
    env.D1_DATABASE.prepare("INSERT INTO licenses (id, tenant_id, plan_id, starts_at, status, limits_json, enabled_resources_json) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)").bind(`appointment-license-${run}`, tenantId, 'plan-appointment', '2028-01-01T00:00:00.000Z', '{}', '["APPOINTMENT_ADMISSION"]'),
  ]);
}

function payload(at = startsAt) { return { customerId: fixture.customerId, serviceId: fixture.serviceId, professionalId: fixture.professionalId, startsAt: at, origin: 'RECEPTION' }; }
function request(key: string, body: Record<string, unknown> = payload()) {
  return worker.fetch(new Request(`https://operations.test/tenants/${tenantId}/appointments`, { method: 'POST', headers: { authorization: 'Bearer actor-dev-admin', 'Idempotency-Key': key, 'x-request-id': `appointment-request-${run}`, 'x-correlation-id': `appointment-correlation-${run}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
}

describe('CreateAppointment authoritative HTTP flow', () => {
  beforeAll(seed);

  it('creates one appointment and atomically records audit, outbox and idempotency', async () => {
    const response = await request(`appointment-key-${run}`);
    expect(response.status).toBe(201);
    expect(response.headers.get('x-request-id')).toBe(`appointment-request-${run}`);
    expect(response.headers.get('x-correlation-id')).toBe(`appointment-correlation-${run}`);
    const body = await response.json() as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({ tenantId, customerId: fixture.customerId, serviceId: fixture.serviceId, professionalId: fixture.professionalId, startsAt, endsAt: '2028-04-10T10:00:00.000Z', durationMinutes: 60, basePriceCents: 20000, discountCents: 0, finalPriceCents: 20000, depositRequired: false, status: 'AWAITING_CONFIRMATION', origin: 'RECEPTION' });

    const appointmentId = body.data.id as string;
    const counts = await env.D1_DATABASE.batch([
      env.D1_DATABASE.prepare('SELECT COUNT(*) AS count FROM appointments WHERE tenant_id = ? AND id = ?').bind(tenantId, appointmentId),
      env.D1_DATABASE.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE tenant_id = ? AND resource_id = ? AND action = 'appointment.created'").bind(tenantId, appointmentId),
      env.D1_DATABASE.prepare("SELECT COUNT(*) AS count FROM outbox_events WHERE tenant_id = ? AND aggregate_id = ? AND event_type = 'AppointmentCreated' AND status = 'PENDING'").bind(tenantId, appointmentId),
    ]);
    expect(counts.map((item) => (item as { results?: Array<{ count: number }> }).results?.[0]?.count)).toEqual([1, 1, 1]);
  });

  it('replays the same resource and rejects the same key with a different intent', async () => {
    const key = `replay-key-${run}`;
    const replayPayload = payload('2028-04-10T11:00:00.000Z');
    const first = await request(key, replayPayload);
    const firstBody = await first.json() as { data: Record<string, unknown> };
    const replay = await request(key, replayPayload);
    const replayBody = await replay.json() as { data: Record<string, unknown> };
    expect(replay.status).toBe(201);
    expect(replayBody.data).toEqual(firstBody.data);
    const conflict = await request(key, payload('2028-04-10T12:00:00.000Z'));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ status: 'error', code: 'IDEMPOTENCY_KEY_CONFLICT' });
  });

  it('rejects invalid origin, missing idempotency and an occupied interval before mutation', async () => {
    const invalid = await worker.fetch(new Request(`https://operations.test/tenants/${tenantId}/appointments`, { method: 'POST', headers: { authorization: 'Bearer actor-dev-admin', 'content-type': 'application/json' }, body: JSON.stringify({ customerId: fixture.customerId, serviceId: fixture.serviceId, professionalId: fixture.professionalId, startsAt, origin: 'INVALID' }) }));
    expect(invalid.status).toBe(400);
    const occupiedPayload = payload('2028-04-10T13:00:00.000Z');
    const first = await request(`occupied-first-${run}`, occupiedPayload);
    expect(first.status).toBe(201);
    const occupied = await request(`occupied-second-${run}`, occupiedPayload);
    expect(occupied.status).toBe(409);
    expect(await occupied.json()).toMatchObject({ status: 'error', code: 'TIME_CONFLICT' });
  });

  it('keeps the HTTP security boundary before the application flow', async () => {
    const unauthenticated = await worker.fetch(new Request(`https://operations.test/tenants/${tenantId}/appointments`, { method: 'POST', body: JSON.stringify(payload()), headers: { 'content-type': 'application/json' } }));
    expect(unauthenticated.status).toBe(401);
    const forbidden = await worker.fetch(new Request('https://operations.test/tenants/other-tenant/appointments', { method: 'POST', headers: { authorization: 'Bearer actor-dev-admin', 'Idempotency-Key': `security-key-${run}`, 'content-type': 'application/json' }, body: JSON.stringify(payload()) }));
    expect(forbidden.status).toBe(403);
    const extraAuthority = await request(`extra-field-${run}`, { ...payload('2028-04-10T14:00:00.000Z'), durationMinutes: 60 });
    expect(extraAuthority.status).toBe(400);
  });
});
