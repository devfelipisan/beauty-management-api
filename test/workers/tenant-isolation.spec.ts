import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

const worker = exports.default as { fetch(request: Request): Promise<Response> };

beforeAll(async () => {
  await env.D1_DATABASE.batch([
    env.D1_DATABASE.prepare('INSERT INTO tenants (id, legal_name, display_name, document, timezone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind('tenant-dev-001', 'Tenant A', 'Tenant A', 'doc-a', 'America/Sao_Paulo', 'ACTIVE', 'now', 'now'),
    env.D1_DATABASE.prepare('INSERT INTO tenants (id, legal_name, display_name, document, timezone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind('tenant-b-001', 'Tenant B', 'Tenant B', 'doc-b', 'America/Sao_Paulo', 'ACTIVE', 'now', 'now'),
    env.D1_DATABASE.prepare('INSERT INTO customers (id, tenant_id, full_name, status, relationship_profile, blocked_for_new_appointments, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind('customer-a', 'tenant-dev-001', 'Customer A', 'ACTIVE', 'NEW', 0, 'now', 'now'),
    env.D1_DATABASE.prepare('INSERT INTO customers (id, tenant_id, full_name, status, relationship_profile, blocked_for_new_appointments, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind('customer-b', 'tenant-b-001', 'Customer B', 'ACTIVE', 'NEW', 0, 'now', 'now'),
  ]);
});

function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('authorization', 'Bearer actor-dev-admin');
  headers.set('x-request-id', `tenant-proof-${path.replaceAll('/', '-')}`);
  headers.set('x-correlation-id', 'tenant-proof-correlation');
  return worker.fetch(new Request(`https://operations.test${path}`, { ...init, headers }));
}

describe('physical tenant isolation', () => {
  it('returns only rows owned by the requested tenant', async () => {
    const response = await request('/tenants/tenant-dev-001/customers');
    const body = await response.json() as { data: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.data.map((customer) => customer.id)).toEqual(['customer-a']);
  });

  it('does not read or mutate a customer from another tenant', async () => {
    const read = await request('/tenants/tenant-dev-001/customers/customer-b');
    const mutation = await request('/tenants/tenant-dev-001/customers/customer-b', {
      method: 'PATCH',
      body: JSON.stringify({ fullName: 'must-not-change' }),
      headers: { 'content-type': 'application/json' },
    });
    const persisted = await env.D1_DATABASE.prepare('SELECT full_name FROM customers WHERE tenant_id = ? AND id = ?').bind('tenant-b-001', 'customer-b').first<{ full_name: string }>();

    expect([404, 403]).toContain(read.status);
    expect([404, 403]).toContain(mutation.status);
    expect(persisted?.full_name).toBe('Customer B');
  });
});
