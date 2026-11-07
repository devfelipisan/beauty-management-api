import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildDevelopmentSeed } from '../../database/seeds/development.mjs';
import type { AgendaResponse } from '@beauty/contracts';

const worker = exports.default as {
  fetch(request: Request): Promise<Response>;
};
const tenantId = 'tenant-dev-001';
const period =
  'from=2028-11-01T00%3A00%3A00.000Z&to=2028-11-02T00%3A00%3A00.000Z';
const appointmentId = `agenda-${crypto.randomUUID()}`;

function request(
  path: string,
  actor = 'actor-dev-admin',
  headers: Record<string, string> = {},
  method = 'GET',
  body?: unknown,
) {
  return worker.fetch(
    new Request(`https://operations.test${path}`, {
      method,
      headers: {
        authorization: `Bearer ${actor}`,
        ...headers,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
}

beforeAll(async () => {
  const seed = buildDevelopmentSeed('2028-11-01');
  await env.D1_DATABASE.batch(
    seed.statements.map((sql: string) => env.D1_DATABASE.prepare(sql)),
  );
  // Controlled read fixtures do not claim successful command execution.
  for (const [id, professional, startsAt, status] of [
    [
      appointmentId,
      'mock-professional-ana',
      '2028-11-01T09:00:00.000Z',
      'AWAITING_CONFIRMATION',
    ],
    [
      `${appointmentId}-b`,
      'mock-professional-bruno',
      '2028-11-01T09:00:00.000Z',
      'CONFIRMED',
    ],
  ]) {
    await env.D1_DATABASE.prepare(
      `INSERT INTO appointments (id,tenant_id,customer_id,service_id,professional_id,starts_at,ends_at,duration_minutes,origin,status,created_at,updated_at)
      VALUES (?,?,'mock-customer-maria','mock-service-consulta',?,?,'2028-11-01T10:00:00.000Z',60,'RECEPTION',?,'test','test')`,
    )
      .bind(id, tenantId, professional, startsAt, status)
      .run();
  }
});

describe('physical operational agenda', () => {
  it('paginates deterministic ties, counts all filtered rows and retains inactive references', async () => {
    await env.D1_DATABASE.prepare(
      "UPDATE professionals SET status='INACTIVE' WHERE tenant_id=? AND id='mock-professional-bruno'",
    )
      .bind(tenantId)
      .run();
    const first = await request(
      `/tenants/${tenantId}/agenda?${period}&limit=1`,
    );
    expect(first.status).toBe(200);
    const { data } = (await first.json()) as { data: AgendaResponse };
    expect(data.appointments).toHaveLength(1);
    expect(data.summary).toEqual({ AWAITING_CONFIRMATION: 1, CONFIRMED: 1 });
    expect(data.page.hasMore).toBe(true);
    const second = await request(
      `/tenants/${tenantId}/agenda?${period}&limit=1&cursor=${encodeURIComponent(data.page.nextCursor!)}`,
    );
    const page = ((await second.json()) as { data: AgendaResponse }).data;
    expect(page.appointments[0].id).not.toBe(data.appointments[0].id);
    expect(page.appointments[0].professional.displayName).toBeTruthy();
    expect(page.summary).toEqual(data.summary);
    expect(page.page.hasMore).toBe(false);
  });

  it('restricts professional scope, details and actions without loading customer records', async () => {
    const response = await request(
      `/tenants/${tenantId}/agenda?${period}`,
      'actor-dev-professional',
    );
    expect(response.status).toBe(200);
    const data = ((await response.json()) as { data: AgendaResponse }).data;
    expect(data.appointments.map((item) => item.id)).toEqual([appointmentId]);
    expect(Object.keys(data.appointments[0].customer).sort()).toEqual([
      'displayName',
      'id',
    ]);
    const professionals = await request(
      `/tenants/${tenantId}/professionals`,
      'actor-dev-professional',
    );
    expect(
      ((await professionals.json()) as { data: { id: string }[] }).data.map(
        (item) => item.id,
      ),
    ).toEqual(['mock-professional-ana']);
    expect(
      (
        await request(
          `/tenants/${tenantId}/agenda?${period}&professionalId=mock-professional-bruno`,
          'actor-dev-professional',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/tenants/${tenantId}/appointments/${appointmentId}-b`,
          'actor-dev-professional',
        )
      ).status,
    ).toBe(404);
    const detail = await request(
      `/tenants/${tenantId}/appointments/${appointmentId}`,
    );
    expect(
      ((await detail.json()) as { data: { allowedActions: string[] } }).data
        .allowedActions,
    ).toEqual(['confirm']);
  });

  it('validates period, page and unknown parameters', async () => {
    for (const suffix of [
      '&limit=101',
      '&limit=0',
      '&status=UNKNOWN',
      '&cursor=invalid',
      '&unexpected=yes',
      '&limit=1&limit=2',
    ]) {
      expect(
        (await request(`/tenants/${tenantId}/agenda?${period}${suffix}`))
          .status,
      ).toBe(400);
    }
    expect(
      (
        await request(
          `/tenants/${tenantId}/agenda?from=2028-01-01T00:00:00Z&to=2028-03-01T00:00:00Z`,
        )
      ).status,
    ).toBe(400);
  });

  it('isolates tenants and verifies the conflict interval without reserving it', async () => {
    const other = await request(`/tenants/tenant-other/agenda?${period}`);
    expect(other.status).toBe(200);
    expect(
      ((await other.json()) as { data: AgendaResponse }).data.appointments,
    ).toEqual([]);
    expect(
      (await request(`/tenants/tenant-other/appointments/${appointmentId}`))
        .status,
    ).toBe(404);
    const interval = await request(
      `/tenants/${tenantId}/professionals/mock-professional-ana/availability?from=2028-11-01T09:00:00Z&to=2028-11-01T10:00:00Z`,
    );
    expect(interval.status).toBe(200);
    expect(
      ((await interval.json()) as { data: { available: boolean } }).data
        .available,
    ).toBe(false);
  });

  it('observes grant revocation and rejects a role not granted to the actor', async () => {
    expect(
      (
        await request(
          `/tenants/${tenantId}/agenda?${period}`,
          'actor-dev-professional',
          { 'x-workspace-role': 'administrator' },
        )
      ).status,
    ).toBe(403);
    await env.D1_DATABASE.prepare(
      "DELETE FROM role_permissions WHERE tenant_id=? AND role_name='professional' AND permission_code='agenda.read'",
    )
      .bind(tenantId)
      .run();
    expect(
      (
        await request(
          `/tenants/${tenantId}/agenda?${period}`,
          'actor-dev-professional',
        )
      ).status,
    ).toBe(403);
    await env.D1_DATABASE.prepare(
      "INSERT INTO role_permissions (tenant_id,role_name,permission_code) VALUES (?,'professional','agenda.read')",
    )
      .bind(tenantId)
      .run();
  });

  it('revalidates the selected role at a real user RPC command', async () => {
    const allowed = await request(
      `/tenants/${tenantId}/appointments/${appointmentId}/confirm`,
      'actor-dev-reception',
      {
        'Idempotency-Key': crypto.randomUUID(),
        'x-workspace-role': 'reception',
      },
      'POST',
      {},
    );
    expect(allowed.status).toBe(200);
    const denied = await request(
      `/tenants/${tenantId}/appointments/${appointmentId}/check-in`,
      'actor-dev-professional',
      {
        'Idempotency-Key': crypto.randomUUID(),
        'x-workspace-role': 'professional',
      },
      'POST',
      {},
    );
    expect(denied.status).toBe(403);
  });

  it('never unions grants for a multi-role actor and rechecks the selection in the receiver', async () => {
    await env.D1_DATABASE.prepare(
      "INSERT INTO membership_roles (tenant_id,actor_id,role_name) VALUES (?,'actor-dev-reception','tenant_admin')",
    )
      .bind(tenantId)
      .run();
    try {
      expect(
        (
          await request(
            `/tenants/${tenantId}/agenda?${period}`,
            'actor-dev-reception',
          )
        ).status,
      ).toBe(403);
      const reception = await request('/v1/me/context', 'actor-dev-reception', {
        'x-tenant-id': tenantId,
        'x-workspace-role': 'reception',
      });
      expect(reception.status).toBe(200);
      const receptionData = (
        (await reception.json()) as { data: { permissions: string[] } }
      ).data;
      expect(receptionData.permissions).not.toContain('professional.create');
      const administrator = await request(
        '/v1/me/context',
        'actor-dev-reception',
        { 'x-tenant-id': tenantId, 'x-workspace-role': 'administrator' },
      );
      expect(
        ((await administrator.json()) as { data: { permissions: string[] } })
          .data.permissions,
      ).toContain('professional.create');
      const rpc = env.CLINICAL_SERVICE as unknown as {
        checkAssessmentEligibility(
          input: Record<string, unknown>,
        ): Promise<unknown>;
      };
      const input = {
        tenantId,
        customerId: 'mock-customer-maria',
        serviceId: 'mock-service-consulta',
        professionalId: 'mock-professional-ana',
      };
      for (const [authority, message] of [
        [undefined, 'AUTHENTICATION_REQUIRED'],
        [
          { version: 1, kind: 'user', token: 'actor-dev-reception' },
          'PERMISSION_DENIED',
        ],
        [
          {
            version: 2,
            kind: 'user',
            token: 'actor-dev-reception',
            selection: { tenantId: 'tenant-other', role: 'administrator' },
          },
          'TENANT_ACCESS_DENIED',
        ],
      ] as const) {
        const [result] = await Promise.allSettled([
          rpc.checkAssessmentEligibility({ ...input, rpcAuthority: authority }),
        ]);
        expect(result).toMatchObject({
          status: 'rejected',
          reason: { message },
        });
      }
      await expect(
        rpc.checkAssessmentEligibility({
          ...input,
          rpcAuthority: {
            version: 2,
            kind: 'user',
            token: 'actor-dev-reception',
            selection: { tenantId, role: 'reception' },
          },
        }),
      ).resolves.toMatchObject({ eligible: false });
    } finally {
      await env.D1_DATABASE.prepare(
        "DELETE FROM membership_roles WHERE tenant_id=? AND actor_id='actor-dev-reception' AND role_name='tenant_admin'",
      )
        .bind(tenantId)
        .run();
    }
  });

  it('keeps legacy RPCs without an approved policy denied even in local fixtures', async () => {
    const billing = env.BILLING_SERVICE as unknown as {
      issueRefund(input: Record<string, unknown>): Promise<unknown>;
    };
    const [result] = await Promise.allSettled([
      billing.issueRefund({
        tenantId,
        actorId: 'actor-dev-admin',
        rpcAuthority: { version: 1, kind: 'user', token: 'actor-dev-admin' },
      }),
    ]);
    expect(result).toMatchObject({
      status: 'rejected',
      reason: { message: 'PERMISSION_DENIED' },
    });
  });

  it('uses the tenant/time index and paginates a larger read fixture without losing records', async () => {
    const prefix = `agenda-volume-${crypto.randomUUID()}`;
    await env.D1_DATABASE.batch(
      Array.from({ length: 250 }, (_, index) => {
        const startsAt = new Date(
          Date.parse('2028-11-03T09:00:00Z') + index * 60000,
        ).toISOString();
        const endsAt = new Date(Date.parse(startsAt) + 60000).toISOString();
        return env.D1_DATABASE.prepare(
          `INSERT INTO appointments (id,tenant_id,customer_id,service_id,professional_id,starts_at,ends_at,duration_minutes,origin,status,created_at,updated_at)
        VALUES (?,?,'mock-customer-maria','mock-service-consulta','mock-professional-ana',?,?,1,'RECEPTION','AWAITING_CONFIRMATION','test','test')`,
        ).bind(
          `${prefix}-${String(index).padStart(3, '0')}`,
          tenantId,
          startsAt,
          endsAt,
        );
      }),
    );
    const plan = await env.D1_DATABASE.prepare(
      'EXPLAIN QUERY PLAN SELECT id FROM appointments WHERE tenant_id=? AND starts_at<? AND ends_at>? ORDER BY starts_at,id LIMIT 101',
    )
      .bind(tenantId, '2028-11-04T00:00:00Z', '2028-11-03T00:00:00Z')
      .all<{ detail: string }>();
    expect(
      plan.results.some((row) =>
        row.detail.includes('idx_appointments_tenant_time'),
      ),
    ).toBe(true);
    const ids = new Set<string>();
    let cursor: string | null = null;
    do {
      const query = new URLSearchParams({
        from: '2028-11-03T00:00:00Z',
        to: '2028-11-04T00:00:00Z',
        limit: '100',
      });
      if (cursor) query.set('cursor', cursor);
      const response = await request(`/tenants/${tenantId}/agenda?${query}`);
      expect(response.status).toBe(200);
      const data = ((await response.json()) as { data: AgendaResponse }).data;
      expect(data.summary).toEqual({ AWAITING_CONFIRMATION: 250 });
      for (const item of data.appointments) {
        expect(ids.has(item.id)).toBe(false);
        ids.add(item.id);
      }
      cursor = data.page.nextCursor;
    } while (cursor);
    expect(ids.size).toBe(250);
  });
});
