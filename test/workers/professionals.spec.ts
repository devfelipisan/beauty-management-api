import { env, exports } from 'cloudflare:workers';

const worker = exports.default as {
  fetch(request: Request): Promise<Response>;
};
const path = '/tenants/tenant-dev-001/professionals';
const send = (suffix = '', token = 'actor-dev-admin', method = 'GET') =>
  worker.fetch(
    new Request(`https://operations.test${path}${suffix}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'x-request-id': 'professionals-request',
        'x-correlation-id': 'professionals-correlation',
      },
    }),
  );

describe('Professionals HTTP through Operations Worker', () => {
  beforeAll(async () => {
    for (const tenant of ['tenant-dev-001', 'professionals-other']) {
      await env.D1_DATABASE.prepare(
        "INSERT OR IGNORE INTO tenants (id,legal_name,display_name,document,timezone,status,created_at,updated_at) VALUES (?,?,?,?,'UTC','ACTIVE','2026-01-01','2026-01-01')",
      )
        .bind(tenant, tenant, tenant, tenant)
        .run();
    }
    for (const [id, tenant, status] of [
      ['professionals-a', 'tenant-dev-001', 'ACTIVE'],
      ['professionals-b', 'tenant-dev-001', 'INACTIVE'],
      ['professionals-secret', 'professionals-other', 'ACTIVE'],
    ]) {
      await env.D1_DATABASE.prepare(
        'INSERT INTO professionals (id,tenant_id,name,status,public_visible,created_at,updated_at) VALUES (?,?,?,?,1,?,?)',
      )
        .bind(id, tenant, id, status, '2026-01-01', '2026-01-01')
        .run();
    }
  });

  it('lists only tenant-owned records with cursor pagination and trace identifiers', async () => {
    const first = await send('?limit=1');
    expect(first.status).toBe(200);
    expect(first.headers.get('x-request-id')).toBe('professionals-request');
    expect(first.headers.get('x-correlation-id')).toBe(
      'professionals-correlation',
    );
    const firstPage = await first.json() as { data: { id: string }[]; page: { hasMore: boolean; nextCursor: string | null } };
    expect(firstPage).toMatchObject({
      data: [
        {
          id: 'professionals-a',
          tenantId: 'tenant-dev-001',
          publicVisible: true,
          status: 'ACTIVE',
        },
      ],
      requestId: 'professionals-request',
      correlationId: 'professionals-correlation',
    });
    expect(firstPage.page.hasMore).toBe(true);
    expect(await (await send('?limit=1&cursor=' + encodeURIComponent(firstPage.page.nextCursor!))).json()).toMatchObject({
      data: [{ id: 'professionals-b', status: 'INACTIVE' }],
      page: { hasMore: false, nextCursor: null },
    });
    expect((await send('?cursor=professionals-b')).status).toBe(400);
  });

  it('rejects unauthenticated and cross-tenant reads', async () => {
    expect(
      (await worker.fetch(new Request(`https://operations.test${path}`)))
        .status,
    ).toBe(401);
    expect((await send('', 'actor-other')).status).toBe(403);
    expect(
      (
        await worker.fetch(
          new Request(
            'https://operations.test/tenants/professionals-other/professionals',
            {
              headers: { authorization: 'Bearer actor-dev-admin' },
            },
          ),
        )
      ).status,
    ).toBe(403);
  });

  it('validates pagination and exposes no mutation route', async () => {
    for (const limit of ['abc', '0', '-1', '1.5', 'Infinity']) {
      expect((await send(`?limit=${limit}`)).status).toBe(400);
    }
    expect((await send('', 'actor-dev-admin', 'POST')).status).toBe(404);
  });
});
