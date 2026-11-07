import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildDevelopmentSeed } from '../../database/seeds/development.mjs';

const worker = exports.default as {
  fetch(request: Request): Promise<Response>;
};
const tenant = 'tenant-dev-001';
const id = `read-snapshot-${crypto.randomUUID()}`;
async function get(path: string, actor: string | null = 'actor-dev-admin') {
  return worker.fetch(
    new Request(`https://operations.test${path}`, {
      headers: actor ? { authorization: `Bearer ${actor}` } : {},
    }),
  );
}
beforeAll(async () => {
  const seed = buildDevelopmentSeed('2030-01-01');
  await env.D1_DATABASE.batch(
    seed.statements.map((sql: string) => env.D1_DATABASE.prepare(sql)),
  );
  await env.D1_DATABASE.prepare(
    `INSERT INTO appointments (id,tenant_id,customer_id,service_id,professional_id,starts_at,ends_at,duration_minutes,origin,status,base_price_cents,discount_cents,final_price_cents,deposit_cents,created_at,updated_at)
    VALUES (?,?,'mock-customer-maria','mock-service-consulta','mock-professional-ana','2031-01-01T10:00:00.000Z','2031-01-01T11:00:00.000Z',60,'RECEPTION','CONFIRMED',12000,1000,11000,2200,'2030-12-01T00:00:00.000Z','2030-12-01T00:00:00.000Z')`,
  )
    .bind(id, tenant)
    .run();
});
describe('complete workspace read contracts', () => {
  it('paginates catalogs, includes persisted links and rejects replay across tenants', async () => {
    for (const kind of ['customers', 'professionals', 'services']) {
      const first = await get(`/tenants/${tenant}/${kind}?limit=1`);
      expect(first.status).toBe(200);
      const page = (await first.json()) as {
        data: Record<string, unknown>[];
        page: { hasMore: boolean; nextCursor: string };
      };
      expect(page.data).toHaveLength(1);
      expect(page.page.hasMore).toBe(true);
      if (kind !== 'customers')
        expect(
          Array.isArray(
            page.data[0][
              kind === 'services' ? 'professionalIds' : 'serviceIds'
            ],
          ),
        ).toBe(true);
      const second = await get(
        `/tenants/${tenant}/${kind}?limit=1&cursor=${encodeURIComponent(page.page.nextCursor)}`,
      );
      const next = (await second.json()) as typeof page;
      expect(second.status).toBe(200);
      expect(next.data[0].id).not.toBe(page.data[0].id);
      expect(
        (
          await get(
            `/tenants/tenant-other/${kind}?cursor=${encodeURIComponent(page.page.nextCursor)}`,
          )
        ).status,
      ).toBe(400);
      expect(
        (await get(`/tenants/${tenant}/${kind}?cursor=invalid`)).status,
      ).toBe(400);
      expect((await get(`/tenants/${tenant}/${kind}?limit=101`)).status).toBe(
        400,
      );
    }
    const response = await get(`/tenants/${tenant}/professionals`);
    const body = (await response.json()) as {
      data: { id: string; serviceIds: string[] }[];
    };
    expect(
      body.data.find((p) => p.id === 'mock-professional-ana')!.serviceIds,
    ).toContain('mock-service-consulta');
    const services = (await (
      await get(`/tenants/${tenant}/services`)
    ).json()) as { data: { id: string; professionalIds: string[] }[] };
    expect(
      services.data.find((s) => s.id === 'mock-service-consulta')!
        .professionalIds,
    ).toContain('mock-professional-ana');
  });
  it('keeps auth, tenant membership and professional segregation authoritative', async () => {
    expect((await get(`/tenants/${tenant}/customers`, null)).status).toBe(401);
    expect((await get(`/tenants/${tenant}/customers`, 'invalid')).status).toBe(
      401,
    );
    expect((await get('/tenants/no-membership/services')).status).toBe(403);
    const response = await get(
      `/tenants/${tenant}/professionals`,
      'actor-dev-professional',
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { id: string }[] };
    expect(body.data.map((row) => row.id)).toEqual(['mock-professional-ana']);
    expect(
      (
        await get(
          `/tenants/tenant-other/professionals`,
          'actor-dev-professional',
        )
      ).status,
    ).toBe(403);
  });
  it('returns persisted financial snapshots and timestamps for list and details', async () => {
    await env.D1_DATABASE.prepare(
      "UPDATE services SET base_price_cents=99999 WHERE tenant_id=? AND id='mock-service-consulta'",
    )
      .bind(tenant)
      .run();
    const response = await get(
      `/tenants/${tenant}/agenda?from=2031-01-01T00:00:00Z&to=2031-01-02T00:00:00Z`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { appointments: Record<string, unknown>[] };
    };
    expect(body.data.appointments[0]).toMatchObject({
      id,
      tenantId: tenant,
      basePriceCents: 12000,
      discountCents: 1000,
      finalPriceCents: 11000,
      depositCents: 2200,
      createdAt: '2030-12-01T00:00:00.000Z',
    });
    const detail = (await (
      await get(`/tenants/${tenant}/appointments/${id}`)
    ).json()) as { data: Record<string, unknown> };
    expect(detail.data.finalPriceCents).toBe(11000);
    expect((await get(`/tenants/tenant-other/appointments/${id}`)).status).toBe(
      404,
    );
  });
});
