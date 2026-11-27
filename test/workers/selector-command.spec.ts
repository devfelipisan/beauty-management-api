import { env, exports } from 'cloudflare:workers';
import { beforeAll, expect, it } from 'vitest';
import { buildDevelopmentSeed } from '../../database/seeds/development.mjs';

type DemoBinding = {
  executeSelectedWorkspaceCommand(request: Request): Promise<Response>;
  readSelectedWorkspace(request: Request): Promise<Response>;
};
const bindings = env as unknown as {
  TEST_SELECTOR_WRITABLE: DemoBinding;
  TEST_SELECTOR_MISSING: DemoBinding;
  TEST_SELECTOR_WRONG: DemoBinding;
};
const tenant = 'tenant-dev-001';
const session = 'a452c069-8943-41b6-bef4-aa957c157aad';
function command(
  kind = 'customers',
  body: unknown = { fullName: 'Cliente demo', phone: 'demo-100' },
  changes: Record<string, string> = {},
  key = crypto.randomUUID(),
) {
  return new Request(`https://operations.internal/tenants/${tenant}/${kind}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': tenant,
      'x-workspace-role': 'administrator',
      'idempotency-key': key,
      'x-demo-session-id': session,
      'x-request-id': 'demo-command-test',
      ...changes,
    },
    body: JSON.stringify(body),
  });
}
beforeAll(async () => {
  await env.D1_DATABASE.batch(
    buildDevelopmentSeed('2030-01-01').statements.map((sql: string) =>
      env.D1_DATABASE.prepare(sql),
    ),
  );
});
it('persists a customer with anonymous system/demo audit, replays exactly and survives a new binding request', async () => {
  const key = crypto.randomUUID();
  const response =
    await bindings.TEST_SELECTOR_WRITABLE.executeSelectedWorkspaceCommand(
      command(undefined, undefined, {}, key),
    );
  expect(response.status).toBe(201);
  const payload = (await response.json()) as { data: { id: string } };
  await env.D1_DATABASE.batch(
    buildDevelopmentSeed('2030-01-01').statements.map((sql: string) =>
      env.D1_DATABASE.prepare(sql),
    ),
  );
  expect(
    await env.D1_DATABASE.prepare(
      'SELECT full_name FROM customers WHERE tenant_id=? AND id=?',
    )
      .bind(tenant, payload.data.id)
      .first(),
  ).toEqual({ full_name: 'Cliente demo' });
  const audit = await env.D1_DATABASE.prepare(
    'SELECT actor_id,metadata_json FROM audit_events WHERE resource_id=?',
  )
    .bind(payload.data.id)
    .first<{ actor_id: string | null; metadata_json: string }>();
  expect(audit?.actor_id).toBeNull();
  expect(JSON.parse(audit!.metadata_json)).toMatchObject({
    mode: 'demo',
    actorType: 'system',
    sessionId: session,
  });
  const replay =
    await bindings.TEST_SELECTOR_WRITABLE.executeSelectedWorkspaceCommand(
      command(undefined, undefined, {}, key),
    );
  expect(replay.status).toBe(201);
  expect(await replay.json()).toEqual(payload);
  const conflict =
    await bindings.TEST_SELECTOR_WRITABLE.executeSelectedWorkspaceCommand(
      command('customers', { fullName: 'Outro', phone: 'demo-101' }, {}, key),
    );
  expect(conflict.status).toBe(409);
  const read = await bindings.TEST_SELECTOR_WRITABLE.readSelectedWorkspace(
    new Request(
      `https://operations.internal/tenants/${tenant}/customers?limit=100`,
      {
        headers: { 'x-tenant-id': tenant, 'x-workspace-role': 'administrator' },
      },
    ),
  );
  expect(
    ((await read.json()) as { data: { id: string }[] }).data.some(
      (row) => row.id === payload.data.id,
    ),
  ).toBe(true);
});
it('creates professionals and services with persisted links and validates cross-tenant references before writing', async () => {
  const professionalResponse =
    await bindings.TEST_SELECTOR_WRITABLE.executeSelectedWorkspaceCommand(
      command('professionals', {
        displayName: 'Profissional demo',
        specialty: 'Estética',
        serviceIds: ['mock-service-consulta'],
      }),
    );
  expect(professionalResponse.status).toBe(201);
  const professional = (await professionalResponse.json()) as {
    data: { id: string; specialty: string; serviceIds: string[] };
  };
  expect(professional.data.specialty).toBe('Estética');
  expect(professional.data.serviceIds).toEqual(['mock-service-consulta']);
  const serviceResponse =
    await bindings.TEST_SELECTOR_WRITABLE.executeSelectedWorkspaceCommand(
      command('services', {
        name: 'Serviço demo',
        category: 'Demo',
        durationMinutes: 30,
        priceCents: 10000,
        professionalIds: [professional.data.id],
        deposit: { required: true, type: 'percentage', value: 25 },
      }),
    );
  expect(serviceResponse.status).toBe(201);
  const service = (await serviceResponse.json()) as {
    data: { id: string; depositPercentageBasisPoints: number };
  };
  expect(service.data.depositPercentageBasisPoints).toBe(2500);
  expect(
    await env.D1_DATABASE.prepare(
      'SELECT service_id FROM professional_services WHERE tenant_id=? AND professional_id=? AND service_id=?',
    )
      .bind(tenant, professional.data.id, service.data.id)
      .first(),
  ).toEqual({ service_id: service.data.id });
  const denied =
    await bindings.TEST_SELECTOR_WRITABLE.executeSelectedWorkspaceCommand(
      command('professionals', {
        displayName: 'Inválido',
        serviceIds: ['missing'],
      }),
    );
  expect(denied.status).toBe(403);
  expect(
    await env.D1_DATABASE.prepare(
      "SELECT id FROM professionals WHERE tenant_id=? AND name='Inválido'",
    )
      .bind(tenant)
      .first(),
  ).toBeNull();
});
it('denies wrong binding, disabled writes, public HTTP, invalid selection and fabricated authority', async () => {
  for (const binding of [
    bindings.TEST_SELECTOR_MISSING,
    bindings.TEST_SELECTOR_WRONG,
  ]) {
    expect(
      (await binding.executeSelectedWorkspaceCommand(command())).status,
    ).toBe(403);
  }
  const local = exports.default as DemoBinding & {
    fetch(request: Request): Promise<Response>;
  };
  expect((await local.executeSelectedWorkspaceCommand(command())).status).toBe(
    403,
  );
  expect((await local.fetch(command())).status).toBe(401);
  for (const changes of [
    { 'x-tenant-id': 'tenant-other' },
    { 'x-workspace-role': 'platform_admin' },
    {
      'x-workspace-role': 'professional',
      'x-professional-id': 'mock-professional-ana',
    },
    { authorization: 'Bearer actor-dev-admin' },
  ])
    expect(
      (
        await bindings.TEST_SELECTOR_WRITABLE.executeSelectedWorkspaceCommand(
          command(undefined, undefined, changes),
        )
      ).status,
    ).toBe(403);
  expect(
    (
      await bindings.TEST_SELECTOR_WRITABLE.executeSelectedWorkspaceCommand(
        command('customers', { fullName: 'X', phone: 'Y', actorId: 'fake' }),
      )
    ).status,
  ).toBe(400);
});
it('returns only implemented capabilities and revalidates grants on every command', async () => {
  const selected = new Request('https://operations.internal/v1/me/context', {
    headers: { 'x-tenant-id': tenant, 'x-workspace-role': 'administrator' },
  });
  const response =
    await bindings.TEST_SELECTOR_WRITABLE.readSelectedWorkspace(selected);
  expect(await response.json()).toMatchObject({
    data: {
      capabilities: {
        mode: 'demo',
        shared: true,
        persistent: true,
        canWrite: true,
        actions: ['customer.create', 'professional.create', 'service.create'],
      },
    },
  });
  await env.D1_DATABASE.prepare(
    "DELETE FROM role_permissions WHERE tenant_id=? AND role_name='tenant_admin' AND permission_code='customer.create'",
  )
    .bind(tenant)
    .run();
  try {
    expect(
      (
        await bindings.TEST_SELECTOR_WRITABLE.executeSelectedWorkspaceCommand(
          command(),
        )
      ).status,
    ).toBe(403);
  } finally {
    await env.D1_DATABASE.prepare(
      "INSERT INTO role_permissions (tenant_id,role_name,permission_code) VALUES (?,'tenant_admin','customer.create')",
    )
      .bind(tenant)
      .run();
  }
});

it('concurrent submissions with the same key persist one mutation and one audit', async () => {
  const key = crypto.randomUUID();
  const body = { fullName: 'Concorrência demo', phone: 'demo-concurrent' };
  const results = await Promise.all(
    [1, 2].map(() =>
      bindings.TEST_SELECTOR_WRITABLE.executeSelectedWorkspaceCommand(
        command('customers', body, {}, key),
      ),
    ),
  );
  expect(results.map((response) => response.status)).toEqual([201, 201]);
  const payloads = (await Promise.all(
    results.map((response) => response.json()),
  )) as { data: { id: string } }[];
  expect(payloads[0].data.id).toBe(payloads[1].data.id);
  expect(
    await env.D1_DATABASE.prepare(
      'SELECT COUNT(*) AS count FROM audit_events WHERE resource_id=?',
    )
      .bind(payloads[0].data.id)
      .first(),
  ).toEqual({ count: 1 });
});

it('rolls back entity, audit and idempotency together when the D1 batch fails', async () => {
  const key = crypto.randomUUID();
  await env.D1_DATABASE.exec(
    "CREATE TRIGGER fail_demo_audit BEFORE INSERT ON audit_events WHEN NEW.request_id='demo-failure-test' BEGIN SELECT RAISE(ABORT, 'injected demo failure'); END",
  );
  try {
    expect(
      (
        await bindings.TEST_SELECTOR_WRITABLE.executeSelectedWorkspaceCommand(
          command(
            'customers',
            { fullName: 'Rollback demo', phone: 'demo-failure' },
            { 'x-request-id': 'demo-failure-test' },
            key,
          ),
        )
      ).status,
    ).toBe(500);
    expect(
      await env.D1_DATABASE.prepare(
        "SELECT id FROM customers WHERE phone='demo-failure'",
      ).first(),
    ).toBeNull();
    expect(
      await env.D1_DATABASE.prepare(
        'SELECT id FROM idempotency_records WHERE idempotency_key=?',
      )
        .bind(key)
        .first(),
    ).toBeNull();
  } finally {
    await env.D1_DATABASE.exec('DROP TRIGGER fail_demo_audit');
  }
});
