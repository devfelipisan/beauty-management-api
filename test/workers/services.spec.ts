import { env, exports } from 'cloudflare:workers';

const worker = exports.default as {
  fetch(request: Request): Promise<Response>;
};
const path = '/tenants/tenant-dev-001/services';
const send = (
  url: string,
  method = 'GET',
  body?: unknown,
  token = 'actor-dev-admin',
) =>
  worker.fetch(
    new Request(`https://operations.test${url}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );

describe('Services HTTP through Operations Worker', () => {
  beforeAll(async () => {
    await env.D1_DATABASE.prepare(
      "INSERT OR IGNORE INTO tenants (id,legal_name,display_name,document,timezone,status,created_at,updated_at) VALUES ('tenant-dev-001','Tenant','Tenant','services-test','UTC','ACTIVE','2026-01-01','2026-01-01')",
    ).run();
  });

  it('creates and reads, but does not grant mutation permissions implicitly', async () => {
    const create = await send(path, 'POST', {
      name: 'Consulta',
      category: 'GENERAL',
      durationMinutes: 30,
      basePriceCents: 10000,
    });
    expect(create.status).toBe(201);
    const { data } = (await create.json()) as { data: { id: string } };
    expect(await (await send(`${path}/${data.id}`)).json()).toMatchObject({
      data: { name: 'Consulta', tenantId: 'tenant-dev-001', status: 'ACTIVE' },
    });
    expect(
      (
        await send(`${path}/${data.id}`, 'PATCH', {
          name: 'Consulta atualizada',
        })
      ).status,
    ).toBe(403);
    const listed = (await (await send(`${path}?limit=1`)).json()) as {
      data: { id: string }[];
    };
    expect(listed.data).toHaveLength(1);
    expect(
      await (await send(`${path}?cursor=${listed.data[0].id}`)).json(),
    ).toMatchObject({ data: [] });
    expect(
      await (await send(`${path}/${data.id}`, 'DELETE')).json(),
    ).toMatchObject({ code: 'PERMISSION_DENIED' });
    const row = await env.D1_DATABASE.prepare(
      'SELECT status FROM services WHERE tenant_id=? AND id=?',
    )
      .bind('tenant-dev-001', data.id)
      .first();
    expect(row).toMatchObject({ status: 'ACTIVE' });
  });

  it('rejects tenant spoofing, invalid input and unauthorized callers', async () => {
    expect(
      (
        await send(path, 'POST', {
          tenantId: 'other',
          name: 'X',
          category: 'GENERAL',
          durationMinutes: 30,
          basePriceCents: 1,
        })
      ).status,
    ).toBe(400);
    expect((await send(path, 'POST', { name: 123 })).status).toBe(400);
    expect(
      (
        await send(path, 'POST', {
          name: 'X',
          category: 'GENERAL',
          durationMinutes: -1,
          basePriceCents: 1,
        })
      ).status,
    ).toBe(400);
    expect((await send(path, 'GET', undefined, 'actor-other')).status).toBe(
      403,
    );
    expect((await send('/tenants/other/services')).status).toBe(403);
    expect((await send(`${path}/missing`)).status).toBe(404);
    expect((await send(`${path}?limit=abc`)).status).toBe(400);
    expect((await send(path, 'PUT', {})).status).toBe(404);
  });

  it('does not read or mutate a service owned by another tenant', async () => {
    await env.D1_DATABASE.prepare(
      "INSERT OR IGNORE INTO tenants (id,legal_name,display_name,document,timezone,status,created_at,updated_at) VALUES ('tenant-other','Other','Other','services-other','UTC','ACTIVE','2026-01-01','2026-01-01')",
    ).run();
    await env.D1_DATABASE.prepare(
      "INSERT INTO services (id,tenant_id,name,category,duration_minutes,base_price_cents,status,created_at,updated_at) VALUES ('foreign-service','tenant-other','Other service','GENERAL',30,1000,'ACTIVE','2026-01-01','2026-01-01')",
    ).run();
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      expect(
        (
          await send(
            `${path}/foreign-service`,
            method,
            method === 'PATCH' ? { name: 'Modified' } : undefined,
          )
        ).status,
      ).toBe(method === 'GET' ? 404 : 403);
    }
    const row = await env.D1_DATABASE.prepare(
      'SELECT name,status FROM services WHERE tenant_id=? AND id=?',
    )
      .bind('tenant-other', 'foreign-service')
      .first();
    expect(row).toEqual({ name: 'Other service', status: 'ACTIVE' });
  });
});
