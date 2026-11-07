import { env, exports } from 'cloudflare:workers';
import { buildDevelopmentSeed } from '../../database/seeds/development.mjs';
import { buildDemoDataset } from '../../database/seeds/demo.mjs';

const database = env.D1_DATABASE;
const operations = exports.default as { fetch(request: Request): Promise<Response> };
const tenantId = 'tenant-dev-001';
const date = '2028-04-01';
const demo = buildDemoDataset(date);

async function request(path: string, method = 'GET', body?: unknown, key?: string) {
  return operations.fetch(new Request(`https://operations.test${path}`, {
    method,
    headers: {
      authorization: 'Bearer actor-dev-admin',
      'x-tenant-id': tenantId,
      'content-type': 'application/json',
      ...(key ? { 'Idempotency-Key': key, 'x-request-id': key, 'x-correlation-id': key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
}

describe('demo catalogue + real Operations D1 mutation', () => {
  beforeAll(async () => {
    const base = buildDevelopmentSeed(date);
    await database.batch(base.statements.map((sql: string) => database.prepare(sql)));
    await database.batch(demo.statements.map((sql: string) => database.prepare(sql)));
  });

  it('populates only synthetic catalogues and keeps the second tenant isolated', async () => {
    const count = async (table: string, tenant: string) => {
      const row = await database.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE tenant_id=?`)
        .bind(tenant).first<{ total: number }>();
      return row?.total;
    };
    expect(await count('customers', tenantId)).toBe(59);
    expect(await count('customers', 'tenant-other')).toBe(1);
    expect(await count('professionals', tenantId)).toBe(8);
    expect(await count('services', tenantId)).toBe(14);
    expect(await count('appointments', tenantId)).toBe(0);
    expect(await count('payments', tenantId)).toBe(0);
    await database.batch(demo.statements.map((sql: string) => database.prepare(sql)));
    expect(await count('customers', tenantId)).toBe(59);
    expect((await database.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  });

  it('creates and confirms appointments using real use cases then reads the agenda', async () => {
    const sample = demo.manifest.appointments.slice(0, 2);
    const results = [];
    for (const item of sample) {
      const response = await request(`/tenants/${tenantId}/appointments`, 'POST', item.body, item.idempotencyKey);
      expect(response.status).toBe(201);
      const payload = await response.json() as { data: { id: string } };
      results.push(payload.data.id);
      if (item.confirm) {
        const confirmed = await request(
          `/tenants/${tenantId}/appointments/${payload.data.id}/confirm`,
          'POST', {}, `${item.idempotencyKey}-confirm`,
        );
        expect(confirmed.status).toBe(200);
      }
    }
    const from = '2028-04-01T00:00:00.000Z';
    const to = '2028-04-04T00:00:00.000Z';
    const list = await request(`/tenants/${tenantId}/agenda?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    expect(list.status).toBe(200);
    const data = await list.json() as { data: { appointments: Array<{ id: string }> } };
    expect(data.data.appointments.map(({ id }) => id)).toEqual(expect.arrayContaining(results));
    expect((await database.prepare('SELECT COUNT(*) AS n FROM audit_events WHERE tenant_id=?')
      .bind(tenantId).first<{ n: number }>())?.n).toBeGreaterThan(0);
  });
});
