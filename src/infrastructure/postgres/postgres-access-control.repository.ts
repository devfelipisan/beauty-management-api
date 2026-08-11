import type { AccessControlRepository, PlatformAccess, TenantAccess } from "@/server/auth/authorization";
import type { PermissionCode } from "@/server/auth/permissions";
import type { SqlClient } from "./sql-client";

type TenantAccessRow = {
  actor_id: string;
  tenant_id: string;
  tenant_display_name: string;
  tenant_public_slug: string | null;
  tenant_status: TenantAccess["tenantStatus"];
  membership_id: string;
  membership_status: TenantAccess["membershipStatus"];
  professional_id: string | null;
  role_code: string | null;
  permission_code: string | null;
};

type PlatformAccessRow = {
  actor_id: string;
  role_code: string | null;
  permission_code: string | null;
};

const tenantAccessSelect = `select u.id as actor_id,
       t.id as tenant_id,
       t.display_name as tenant_display_name,
       t.public_slug as tenant_public_slug,
       t.status as tenant_status,
       m.id as membership_id,
       m.status as membership_status,
       pm.professional_id,
       r.code as role_code,
       rp.permission_code
from identity.users u
join identity.tenant_memberships m on m.user_id = u.id
join app.tenants t on t.id = m.tenant_id
left join identity.professional_memberships pm on pm.tenant_id = m.tenant_id and pm.membership_id = m.id
left join identity.membership_roles mr on mr.tenant_id = m.tenant_id and mr.membership_id = m.id
left join identity.roles r on r.id = mr.role_id and r.tenant_id = m.tenant_id
left join identity.role_permissions rp on rp.role_id = r.id
where u.auth_subject = $1::uuid and u.status = 'active'`;

function groupTenantAccess(rows: TenantAccessRow[], authSubject: string): TenantAccess[] {
  const grouped = new Map<string, TenantAccess>();
  for (const row of rows) {
    const existing = grouped.get(row.tenant_id);
    if (existing) {
      if (row.role_code && !existing.roles.includes(row.role_code)) existing.roles.push(row.role_code);
      if (row.permission_code && !existing.permissions.includes(row.permission_code as PermissionCode)) {
        existing.permissions.push(row.permission_code as PermissionCode);
      }
      continue;
    }
    grouped.set(row.tenant_id, {
      actorId: row.actor_id,
      authSubject,
      tenantId: row.tenant_id,
      tenantDisplayName: row.tenant_display_name,
      tenantPublicSlug: row.tenant_public_slug ?? undefined,
      tenantStatus: row.tenant_status,
      membershipId: row.membership_id,
      membershipStatus: row.membership_status,
      professionalId: row.professional_id ?? undefined,
      roles: row.role_code ? [row.role_code] : [],
      permissions: row.permission_code ? [row.permission_code as PermissionCode] : [],
    });
  }
  return [...grouped.values()];
}

export class PostgresAccessControlRepository implements AccessControlRepository {
  constructor(private readonly sql: SqlClient) {}

  async listTenantAccesses(authSubject: string): Promise<TenantAccess[]> {
    const result = await this.sql.query<TenantAccessRow>(`${tenantAccessSelect} order by t.display_name, m.created_at`, [authSubject]);
    return groupTenantAccess(result.rows, authSubject);
  }

  async resolveTenantAccess(authSubject: string, tenantId: string): Promise<TenantAccess | null> {
    const result = await this.sql.query<TenantAccessRow>(`${tenantAccessSelect} and m.tenant_id = $2::uuid`, [authSubject, tenantId]);
    return groupTenantAccess(result.rows, authSubject)[0] ?? null;
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
