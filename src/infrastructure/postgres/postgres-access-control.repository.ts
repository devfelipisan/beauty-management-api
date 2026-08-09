import type { AccessControlRepository, PlatformAccess, TenantAccess } from "@/server/auth/authorization";
import type { PermissionCode } from "@/server/auth/permissions";
import type { SqlClient } from "./sql-client";

type TenantAccessRow = {
  actor_id: string;
  membership_id: string;
  membership_status: "active" | "inactive" | "suspended";
  role_code: string | null;
  permission_code: string | null;
};

type PlatformAccessRow = {
  actor_id: string;
  role_code: string | null;
  permission_code: string | null;
};

export class PostgresAccessControlRepository implements AccessControlRepository {
  constructor(private readonly sql: SqlClient) {}

  async resolveTenantAccess(authSubject: string, tenantId: string): Promise<TenantAccess | null> {
    const result = await this.sql.query<TenantAccessRow>(
      `select u.id as actor_id,
              m.id as membership_id,
              m.status as membership_status,
              r.code as role_code,
              rp.permission_code
       from identity.users u
       join identity.tenant_memberships m on m.user_id = u.id and m.tenant_id = $2::uuid
       left join identity.membership_roles mr on mr.tenant_id = m.tenant_id and mr.membership_id = m.id
       left join identity.roles r on r.id = mr.role_id and r.tenant_id = m.tenant_id
       left join identity.role_permissions rp on rp.role_id = r.id
       where u.auth_subject = $1::uuid and u.status = 'active'`,
      [authSubject, tenantId],
    );
    if (result.rows.length === 0) return null;
    const first = result.rows[0];
    return {
      actorId: first.actor_id,
      authSubject,
      tenantId,
      membershipId: first.membership_id,
      membershipStatus: first.membership_status,
      roles: [...new Set(result.rows.flatMap((row) => row.role_code ? [row.role_code] : []))],
      permissions: [...new Set(result.rows.flatMap((row) => row.permission_code ? [row.permission_code as PermissionCode] : []))],
    };
  }

  async resolvePlatformAccess(authSubject: string): Promise<PlatformAccess | null> {
    const result = await this.sql.query<PlatformAccessRow>(
      `select u.id as actor_id, r.code as role_code, rp.permission_code
       from identity.users u
       join identity.platform_user_roles pur on pur.user_id = u.id
       join identity.roles r on r.id = pur.role_id and r.tenant_id is null
       left join identity.role_permissions rp on rp.role_id = r.id
       where u.auth_subject = $1::uuid and u.status = 'active'`,
      [authSubject],
    );
    if (result.rows.length === 0) return null;
    return {
      actorId: result.rows[0].actor_id,
      authSubject,
      roles: [...new Set(result.rows.flatMap((row) => row.role_code ? [row.role_code] : []))],
      permissions: [...new Set(result.rows.flatMap((row) => row.permission_code ? [row.permission_code as PermissionCode] : []))],
    };
  }
}
