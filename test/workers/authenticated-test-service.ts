import { env } from 'cloudflare:workers';
import { MockTenantMembershipProvider } from '@beauty/tenancy/adapters/mock-tenant-membership-provider';

/** Explicit test actor setup. The real Worker receiver still authenticates every call. */
export function authenticatedTestService<T extends object>(service: T): T {
  return new Proxy(service, {
    get(target, key) {
      const method = Reflect.get(target, key);
      if (typeof method !== 'function' || key === 'fetch') return method;
      return async (input: Record<string, unknown>) => {
        if (typeof input.tenantId !== 'string')
          return Reflect.apply(method, target, [input]);
        const tenantId = input.tenantId;
        const actorId = 'actor-dev-admin';
        const fixture =
          await new MockTenantMembershipProvider().findActiveMembership(
            actorId,
            'tenant-dev-001',
          );
        if (!fixture) throw new Error('Missing test actor');
        await env.D1_DATABASE.batch([
          env.D1_DATABASE.prepare(
            "INSERT OR IGNORE INTO identities (id,issuer,subject,active,created_at,updated_at) VALUES (?,'synthetic-local',?,1,'test','test')",
          ).bind(actorId, actorId),
          env.D1_DATABASE.prepare(
            "INSERT OR IGNORE INTO roles (tenant_id,name,active) VALUES (?,'tenant_admin',1)",
          ).bind(tenantId),
          env.D1_DATABASE.prepare(
            "INSERT OR IGNORE INTO tenant_memberships (tenant_id,actor_id,active,created_at,updated_at) VALUES (?,?,1,'test','test')",
          ).bind(tenantId, actorId),
          env.D1_DATABASE.prepare(
            "INSERT OR IGNORE INTO membership_roles (tenant_id,actor_id,role_name) VALUES (?,?,'tenant_admin')",
          ).bind(tenantId, actorId),
        ]);
        await env.D1_DATABASE.batch(
          fixture.permissions.flatMap((code) => [
            env.D1_DATABASE.prepare(
              'INSERT OR IGNORE INTO permissions (code) VALUES (?)',
            ).bind(code),
            env.D1_DATABASE.prepare(
              "INSERT OR IGNORE INTO role_permissions (tenant_id,role_name,permission_code) VALUES (?,'tenant_admin',?)",
            ).bind(tenantId, code),
          ]),
        );
        return Reflect.apply(method, target, [
          {
            ...input,
            rpcAuthority: { version: 1, kind: 'user', token: actorId },
          },
        ]);
      };
    },
  });
}
