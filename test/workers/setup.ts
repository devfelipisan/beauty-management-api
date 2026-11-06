import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach } from 'vitest';
import { MockTenantMembershipProvider } from '@beauty/tenancy/adapters/mock-tenant-membership-provider';

beforeAll(async () => {
  await applyD1Migrations(env.D1_DATABASE, env.TEST_MIGRATIONS);
});

// Legacy fixture grants are persisted explicitly in the test database only.
// User commands still authenticate and resolve current grants in every receiver.
beforeEach(async () => {
  const tenantId = 'tenant-dev-001';
  const tenant = await env.D1_DATABASE.prepare('SELECT id FROM tenants WHERE id=?').bind(tenantId).first();
  if (!tenant) return;
  const fixture = await new MockTenantMembershipProvider().findActiveMembership('actor-dev-admin', tenantId);
  if (!fixture) throw new Error('Missing test authority fixture');
  await env.D1_DATABASE.batch([
    env.D1_DATABASE.prepare("INSERT OR IGNORE INTO identities (id,issuer,subject,active,created_at,updated_at) VALUES ('actor-dev-admin','synthetic-local','actor-dev-admin',1,'test','test')"),
    env.D1_DATABASE.prepare("INSERT OR IGNORE INTO tenant_memberships (tenant_id,actor_id,active,created_at,updated_at) VALUES (?,'actor-dev-admin',1,'test','test')").bind(tenantId),
    env.D1_DATABASE.prepare("INSERT OR IGNORE INTO roles (tenant_id,name,active) VALUES (?,'tenant_admin',1)").bind(tenantId),
    env.D1_DATABASE.prepare("INSERT OR IGNORE INTO membership_roles (tenant_id,actor_id,role_name) VALUES (?,'actor-dev-admin','tenant_admin')").bind(tenantId),
  ]);
  const grants = [...fixture.permissions, 'agenda.read'];
  await env.D1_DATABASE.batch(grants.flatMap((code) => [
    env.D1_DATABASE.prepare('INSERT OR IGNORE INTO permissions (code) VALUES (?)').bind(code),
    env.D1_DATABASE.prepare("INSERT OR IGNORE INTO role_permissions (tenant_id,role_name,permission_code) VALUES (?,'tenant_admin',?)").bind(tenantId, code),
  ]));
});
