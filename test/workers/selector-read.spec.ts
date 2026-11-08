import { env, exports } from 'cloudflare:workers';
import { beforeAll, expect, it } from 'vitest';
import { buildDevelopmentSeed } from '../../database/seeds/development.mjs';

type SelectorBinding = {
  readSelectedWorkspace(request: Request): Promise<Response>;
};
const bindings = env as unknown as {
  TEST_SELECTOR_ALLOWED: SelectorBinding;
  TEST_SELECTOR_MISSING: SelectorBinding;
  TEST_SELECTOR_WRONG: SelectorBinding;
};
const tenant = 'tenant-dev-001';
const professional = 'mock-professional-ana';
const worker = exports.default as {
  fetch(request: Request): Promise<Response>;
};
function request(
  path: string,
  changes: Record<string, string> = {},
  method = 'GET',
) {
  return new Request(`https://operations.internal${path}`, {
    method,
    headers: {
      'x-request-id': 'selector-test',
      'x-tenant-id': tenant,
      'x-workspace-role': 'reception',
      ...changes,
    },
  });
}
const read = (path: string, headers: Record<string, string> = {}) =>
  bindings.TEST_SELECTOR_ALLOWED.readSelectedWorkspace(request(path, headers));
beforeAll(async () => {
  const seed = buildDevelopmentSeed('2030-01-01');
  await env.D1_DATABASE.batch(
    seed.statements.map((sql: string) => env.D1_DATABASE.prepare(sql)),
  );
});
it('uses a real service binding and persisted D1 catalog without JWT or identity', async () => {
  const response = await read('/v1/me/tenants');
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    data: { tenants: { id: string; roles: { code: string }[] }[] };
  };
  expect(
    body.data.tenants.some(
      (item) =>
        item.id === tenant &&
        item.roles.some((role) => role.code === 'reception'),
    ),
  ).toBe(true);
  const context = await read('/v1/me/context');
  expect(context.status).toBe(200);
  const selected = (await context.json()) as { data: Record<string, unknown> };
  expect(selected.data).toMatchObject({ tenantId: tenant, role: 'reception' });
  expect(selected.data.actorId).toBeUndefined();
  expect(selected.data.membershipId).toBeUndefined();
  for (const resource of ['customers', 'professionals', 'services']) {
    const result = await read(`/tenants/${tenant}/${resource}`);
    expect(result.status).toBe(200);
    expect(
      ((await result.json()) as { data: unknown[] }).data.length,
    ).toBeGreaterThan(0);
  }
  const reload = await read('/v1/me/tenants');
  expect(await reload.json()).toEqual(body);
});
it('denies missing/wrong binding props and cannot impersonate caller through headers', async () => {
  for (const binding of [
    bindings.TEST_SELECTOR_MISSING,
    bindings.TEST_SELECTOR_WRONG,
  ]) {
    const result = await binding.readSelectedWorkspace(
      request('/v1/me/tenants', {
        'x-caller': 'beauty-management-web',
        'x-actor-id': 'actor-dev-admin',
      }),
    );
    expect(result.status).toBe(403);
  }
  expect(
    (await worker.fetch(request(`/tenants/${tenant}/customers`))).status,
  ).toBe(401);
});
it('rejects every command, unknown route and mismatched tenant before writing', async () => {
  const before = await env.D1_DATABASE.prepare(
    'SELECT COUNT(*) AS count FROM appointments',
  ).first<{ count: number }>();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
    expect(
      (
        await bindings.TEST_SELECTOR_ALLOWED.readSelectedWorkspace(
          request(`/tenants/${tenant}/appointments`, {}, method),
        )
      ).status,
    ).toBe(403);
  for (const path of [
    `/tenants/tenant-other/customers`,
    `/tenants/${tenant}/payments`,
    `/tenants/${tenant}/appointments/a/confirm`,
    '/v1/platform/tenants',
  ])
    expect((await read(path)).status).toBe(403);
  expect(
    await env.D1_DATABASE.prepare(
      'SELECT COUNT(*) AS count FROM appointments',
    ).first(),
  ).toEqual(before);
});
it('validates active tenant, role and same-tenant professional and pins professional reads', async () => {
  expect(
    (
      await read(`/tenants/${tenant}/customers`, {
        'x-workspace-role': 'owner',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await read('/tenants/nonexistent/customers', {
        'x-tenant-id': 'nonexistent',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await read(`/tenants/${tenant}/professionals`, {
        'x-workspace-role': 'professional',
        'x-professional-id': 'missing',
      })
    ).status,
  ).toBe(403);
  const response = await read(`/tenants/${tenant}/professionals`, {
    'x-workspace-role': 'professional',
    'x-professional-id': professional,
  });
  expect(response.status).toBe(200);
  expect(
    ((await response.json()) as { data: { id: string }[] }).data.map(
      (row) => row.id,
    ),
  ).toEqual([professional]);
  const period = 'from=2030-01-01T00:00:00Z&to=2030-01-02T00:00:00Z';
  expect(
    (
      await read(`/tenants/${tenant}/agenda?${period}&professionalId=other`, {
        'x-workspace-role': 'professional',
        'x-professional-id': professional,
      })
    ).status,
  ).toBe(403);
  const first = await read(`/tenants/${tenant}/customers?limit=1`);
  const page = (await first.json()) as { page: { nextCursor: string | null } };
  expect(page.page.nextCursor).not.toBeNull();
  expect(
    (
      await read(
        `/tenants/${tenant}/customers?cursor=${encodeURIComponent(page.page.nextCursor!)}`,
        { 'x-workspace-role': 'administrator' },
      )
    ).status,
  ).toBe(400);
});

it('revalidates revoked roles on every read instead of caching selector authority', async () => {
  await env.D1_DATABASE.prepare(
    "UPDATE roles SET active=0 WHERE tenant_id=? AND name='reception'",
  )
    .bind(tenant)
    .run();
  try {
    expect((await read(`/tenants/${tenant}/customers`)).status).toBe(403);
    const catalog = await read('/v1/me/tenants');
    const data = (await catalog.json()) as {
      data: { tenants: { id: string; roles: { code: string }[] }[] };
    };
    expect(
      data.data.tenants
        .find((item) => item.id === tenant)
        ?.roles.some((role) => role.code === 'reception'),
    ).toBe(false);
  } finally {
    await env.D1_DATABASE.prepare(
      "UPDATE roles SET active=1 WHERE tenant_id=? AND name='reception'",
    )
      .bind(tenant)
      .run();
  }
});

it('grants no customer access implicitly and scopes an explicitly permitted professional to linked customers', async () => {
  const headers = {
    'x-workspace-role': 'professional',
    'x-professional-id': professional,
  };
  expect((await read(`/tenants/${tenant}/customers`, headers)).status).toBe(
    403,
  );
  await env.D1_DATABASE.prepare(
    "INSERT INTO role_permissions (tenant_id,role_name,permission_code) VALUES (?,'professional','customer.read')",
  )
    .bind(tenant)
    .run();
  try {
    const response = await read(`/tenants/${tenant}/customers`, headers);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { id: string; tenantId: string }[];
    };
    const linked = await env.D1_DATABASE.prepare(
      'SELECT DISTINCT customer_id AS id FROM appointments WHERE tenant_id=? AND professional_id=? ORDER BY customer_id',
    )
      .bind(tenant, professional)
      .all<{ id: string }>();
    expect(body.data.map((row) => row.id)).toEqual(
      linked.results.slice(0, 20).map((row) => row.id),
    );
    expect(body.data.every((row) => row.tenantId === tenant)).toBe(true);
  } finally {
    await env.D1_DATABASE.prepare(
      "DELETE FROM role_permissions WHERE tenant_id=? AND role_name='professional' AND permission_code='customer.read'",
    )
      .bind(tenant)
      .run();
  }
  expect((await read(`/tenants/${tenant}/customers`, headers)).status).toBe(
    403,
  );
});
