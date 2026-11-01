import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

const worker = exports.default as {
  fetch(request: Request): Promise<Response>;
};
const tenantId = 'tenant-dev-001';
const run = crypto.randomUUID();
const customerId = `change-customer-${run}`;
const serviceId = `change-service-${run}`;
const professionalId = `change-professional-${run}`;

async function seed() {
  await env.D1_DATABASE.batch([
    env.D1_DATABASE.prepare(
      "INSERT OR IGNORE INTO tenants (id,legal_name,display_name,document,timezone,status,created_at,updated_at) VALUES (?,? ,?,?,?,'ACTIVE',?,?)",
    ).bind(
      tenantId,
      'Development Tenant',
      'Development',
      `888${run.replaceAll('-', '').slice(0, 11)}`,
      'America/Sao_Paulo',
      '2028-01-01',
      '2028-01-01',
    ),
    env.D1_DATABASE.prepare(
      "INSERT INTO customers (id,tenant_id,full_name,status,relationship_profile,blocked_for_new_appointments,created_at,updated_at) VALUES (?,?,'Change Customer','ACTIVE','NEW',0,?,?)",
    ).bind(customerId, tenantId, '2028-01-01', '2028-01-01'),
    env.D1_DATABASE.prepare(
      "INSERT INTO services (id,tenant_id,name,category,duration_minutes,base_price_cents,status,requires_assessment,allows_discount,deposit_mode,created_at,updated_at) VALUES (?,?,'Change Service','GENERAL',60,20000,'ACTIVE',0,0,'NOT_REQUIRED',?,?)",
    ).bind(serviceId, tenantId, '2028-01-01', '2028-01-01'),
    env.D1_DATABASE.prepare(
      "INSERT INTO professionals (id,tenant_id,name,status,public_visible,created_at,updated_at) VALUES (?,?,'Change Professional','ACTIVE',1,?,?)",
    ).bind(professionalId, tenantId, '2028-01-01', '2028-01-01'),
    env.D1_DATABASE.prepare(
      'INSERT INTO professional_services (tenant_id,professional_id,service_id,created_at) VALUES (?,?,?,?)',
    ).bind(tenantId, professionalId, serviceId, '2028-01-01'),
    env.D1_DATABASE.prepare(
      "INSERT INTO licenses (id,tenant_id,plan_id,starts_at,status,limits_json,enabled_resources_json) VALUES (?,?,'plan-change',?,'ACTIVE','{}','[\"APPOINTMENT_ADMISSION\"]')",
    ).bind(`change-license-${run}`, tenantId, '2028-01-01T00:00:00.000Z'),
  ]);
}

function req(path: string, method = 'POST', key?: string, body?: unknown) {
  return worker.fetch(
    new Request(`https://operations.test${path}`, {
      method,
      headers: {
        authorization: 'Bearer actor-dev-admin',
        'x-request-id': key ?? `change-request-${run}`,
        'x-correlation-id': `change-correlation-${run}`,
        ...(key ? { 'Idempotency-Key': key } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
}

describe('appointment reschedule authoritative flow', () => {
  beforeAll(seed);
  it('blocks new photography journeys when capture is unavailable', async () => {
    await env.D1_DATABASE.prepare(
      'UPDATE services SET requires_photography=1 WHERE tenant_id=? AND id=?',
    )
      .bind(tenantId, serviceId)
      .run();
    try {
      const response = await req(
        `/tenants/${tenantId}/appointments`,
        'POST',
        crypto.randomUUID(),
        {
          customerId,
          serviceId,
          professionalId,
          startsAt: '2028-09-10T09:00:00.000Z',
          origin: 'RECEPTION',
        },
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        code: 'CLINICAL_MEDIA_UNAVAILABLE',
      });
    } finally {
      await env.D1_DATABASE.prepare(
        'UPDATE services SET requires_photography=0 WHERE tenant_id=? AND id=?',
      )
        .bind(tenantId, serviceId)
        .run();
    }
  });
  async function createAt(startsAt: string) {
    const response = await req(
      `/tenants/${tenantId}/appointments`,
      'POST',
      crypto.randomUUID(),
      { customerId, serviceId, professionalId, startsAt, origin: 'RECEPTION' },
    );
    expect(response.status).toBe(201);
    return ((await response.json()) as { data: { id: string } }).data.id;
  }

  it('keeps the new time occupied and replays after subsequent state changes', async () => {
    const id = await createAt('2028-06-10T09:00:00.000Z');
    const key = crypto.randomUUID();
    const body = {
      startsAt: '2028-06-10T11:00:00.000Z',
      professionalId,
      reason: 'Move appointment',
    };
    const first = await req(
      `/tenants/${tenantId}/appointments/${id}/reschedule`,
      'POST',
      key,
      body,
    );
    expect(first.status).toBe(200);
    const original = await first.json();
    const conflict = await req(
      `/tenants/${tenantId}/appointments`,
      'POST',
      crypto.randomUUID(),
      {
        customerId,
        serviceId,
        professionalId,
        startsAt: body.startsAt,
        origin: 'RECEPTION',
      },
    );
    expect(conflict.status).toBe(409);
    await env.D1_DATABASE.prepare(
      "UPDATE appointments SET status='COMPLETED' WHERE tenant_id=? AND id=?",
    )
      .bind(tenantId, id)
      .run();
    const replay = await req(
      `/tenants/${tenantId}/appointments/${id}/reschedule`,
      'POST',
      key,
      body,
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      data: (original as { data: unknown }).data,
    });
  });

  it('allows only one of two concurrent reschedules into the same interval', async () => {
    const first = await createAt('2028-07-10T09:00:00.000Z');
    const second = await createAt('2028-07-10T10:00:00.000Z');
    const body = {
      startsAt: '2028-07-10T13:00:00.000Z',
      professionalId,
      reason: 'Concurrent request',
    };
    const responses = await Promise.all(
      [first, second].map((id) =>
        req(
          `/tenants/${tenantId}/appointments/${id}/reschedule`,
          'POST',
          crypto.randomUUID(),
          body,
        ),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      (
        await env.D1_DATABASE.prepare(
          'SELECT COUNT(*) AS count FROM appointments WHERE tenant_id=? AND professional_id=? AND starts_at=?',
        )
          .bind(tenantId, professionalId, body.startsAt)
          .first<{ count: number }>()
      )?.count,
    ).toBe(1);
  });

  it('serializes creation against rescheduling into the same slot', async () => {
    const id = await createAt('2028-10-10T09:00:00.000Z');
    const startsAt = '2028-10-10T11:00:00.000Z';
    const responses = await Promise.all([
      req(
        `/tenants/${tenantId}/appointments/${id}/reschedule`,
        'POST',
        crypto.randomUUID(),
        { startsAt, professionalId, reason: 'Concurrent move' },
      ),
      req(`/tenants/${tenantId}/appointments`, 'POST', crypto.randomUUID(), {
        customerId,
        serviceId,
        professionalId,
        startsAt,
        origin: 'RECEPTION',
      }),
    ]);
    expect(responses.filter((response) => response.ok)).toHaveLength(1);
    expect(
      responses.filter((response) => response.status === 409),
    ).toHaveLength(1);
    const occupied = await env.D1_DATABASE.prepare(
      'SELECT COUNT(*) AS count FROM appointments WHERE tenant_id=? AND professional_id=? AND starts_at=?',
    )
      .bind(tenantId, professionalId, startsAt)
      .first<{ count: number }>();
    expect(occupied?.count).toBe(1);
  });

  it('rejects a professional outside the tenant without committing history', async () => {
    const id = await createAt('2028-08-10T09:00:00.000Z');
    const response = await req(
      `/tenants/${tenantId}/appointments/${id}/reschedule`,
      'POST',
      crypto.randomUUID(),
      {
        startsAt: '2028-08-10T11:00:00.000Z',
        professionalId: 'foreign-professional',
        reason: 'Invalid reference',
      },
    );
    expect(response.status).toBe(409);
    expect(
      (
        await env.D1_DATABASE.prepare(
          'SELECT COUNT(*) AS count FROM appointment_reschedule_history WHERE tenant_id=? AND appointment_id=?',
        )
          .bind(tenantId, id)
          .first<{ count: number }>()
      )?.count,
    ).toBe(0);
  });
  it('preserves the same appointment, history, audit and idempotent replay', async () => {
    const created = await req(
      `/tenants/${tenantId}/appointments`,
      'POST',
      `create-change-${run}`,
      {
        customerId,
        serviceId,
        professionalId,
        startsAt: '2028-05-10T09:00:00.000Z',
        origin: 'RECEPTION',
      },
    );
    expect(created.status).toBe(201);
    const appointmentId = ((await created.json()) as { data: { id: string } })
      .data.id;
    const key = `reschedule-${run}`;
    const body = {
      startsAt: '2028-05-10T11:00:00.000Z',
      professionalId,
      reason: 'Customer requested a new time',
    };
    const first = await req(
      `/tenants/${tenantId}/appointments/${appointmentId}/reschedule`,
      'POST',
      key,
      body,
    );
    expect(first.status).toBe(200);
    expect(
      ((await first.json()) as { data: Record<string, unknown> }).data,
    ).toMatchObject({
      appointmentId,
      status: 'RESCHEDULED',
      startsAt: body.startsAt,
      professionalId,
    });
    const replay = await req(
      `/tenants/${tenantId}/appointments/${appointmentId}/reschedule`,
      'POST',
      key,
      body,
    );
    expect(replay.status).toBe(200);
    const counts = await env.D1_DATABASE.batch([
      env.D1_DATABASE.prepare(
        'SELECT COUNT(*) AS count FROM appointment_reschedule_history WHERE tenant_id=? AND appointment_id=?',
      ).bind(tenantId, appointmentId),
      env.D1_DATABASE.prepare(
        "SELECT COUNT(*) AS count FROM audit_events WHERE tenant_id=? AND resource_id=? AND action='appointment.rescheduled'",
      ).bind(tenantId, appointmentId),
      env.D1_DATABASE.prepare(
        "SELECT COUNT(*) AS count FROM outbox_events WHERE tenant_id=? AND aggregate_id=? AND event_type='AppointmentRescheduled'",
      ).bind(tenantId, appointmentId),
    ]);
    expect(
      counts.map(
        (x) => (x as { results: Array<{ count: number }> }).results[0].count,
      ),
    ).toEqual([1, 1, 1]);
  });
});
