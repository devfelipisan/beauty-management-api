import type { D1DatabaseLike } from '@beauty/database/d1/d1.types';
import type { AuthenticatedIdentity } from '@beauty/authentication/authenticated-identity';
import type { IdentityDirectory } from '@beauty/authentication/adapters/jwt-identity-provider';
import type { TenantMembershipProvider } from '../ports/tenant-membership-provider.js';
import type { TenantMembership } from '../tenant-membership.js';

export class D1TenantMembershipProvider
  implements TenantMembershipProvider, IdentityDirectory
{
  constructor(private readonly db: D1DatabaseLike) {}

  async listActiveWorkspaces(actorId: string) {
    const result = await this.db
      .prepare(
        `SELECT t.id,t.display_name,t.status,r.name AS role_name,p.id AS professional_id,p.name AS professional_name
      FROM tenant_memberships m JOIN identities i ON i.id=m.actor_id AND i.active=1
      JOIN tenants t ON t.id=m.tenant_id AND t.status='ACTIVE'
      JOIN membership_roles mr ON mr.tenant_id=m.tenant_id AND mr.actor_id=m.actor_id
      JOIN roles r ON r.tenant_id=mr.tenant_id AND r.name=mr.role_name AND r.active=1
      LEFT JOIN professionals p ON p.tenant_id=m.tenant_id AND p.id=m.professional_id AND p.status='ACTIVE'
      WHERE m.actor_id=? AND m.active=1 ORDER BY t.id,r.name`,
      )
      .bind(actorId)
      .all<{
        id: string;
        display_name: string;
        status: string;
        role_name: string;
        professional_id: string | null;
        professional_name: string | null;
      }>();
    const tenants = new Map<
      string,
      {
        id: string;
        displayName: string;
        status: string;
        roles: {
          code: 'administrator' | 'reception' | 'professional';
          label: string;
          professionals?: { id: string; displayName: string }[];
        }[];
      }
    >();
    for (const row of result.results) {
      // Presentation aliases for the roles documented by the Web contract; this grants nothing.
      const code =
        row.role_name === 'tenant_admin'
          ? 'administrator'
          : row.role_name === 'reception'
            ? 'reception'
            : row.role_name === 'professional'
              ? 'professional'
              : null;
      if (!code || (code === 'professional' && !row.professional_id)) continue;
      const tenant = tenants.get(row.id) ?? {
        id: row.id,
        displayName: row.display_name,
        status: row.status,
        roles: [],
      };
      tenant.roles.push({
        code,
        label:
          code === 'administrator'
            ? 'Administração'
            : code === 'reception'
              ? 'Recepção'
              : 'Profissional',
        ...(code === 'professional'
          ? {
              professionals: [
                {
                  id: row.professional_id!,
                  displayName: row.professional_name!,
                },
              ],
            }
          : {}),
      });
      tenants.set(row.id, tenant);
    }
    return { tenants: [...tenants.values()] };
  }

  async findIdentity(
    issuer: string,
    subject: string,
  ): Promise<AuthenticatedIdentity | null> {
    const row = await this.db
      .prepare(
        'SELECT id FROM identities WHERE issuer=? AND subject=? AND active=1',
      )
      .bind(issuer, subject)
      .first<{ id: string }>();
    return row ? { actorId: row.id, subject } : null;
  }

  async findActiveMembership(
    actorId: string,
    tenantId: string,
  ): Promise<TenantMembership | null> {
    // One query reads membership and permissions from the same database snapshot.
    const result = await this.db
      .prepare(
        `SELECT m.professional_id, r.name AS role_name, rp.permission_code
      FROM tenant_memberships m
      JOIN tenants t ON t.id=m.tenant_id AND t.status='ACTIVE'
      JOIN identities i ON i.id=m.actor_id AND i.active=1
      LEFT JOIN membership_roles mr ON mr.tenant_id=m.tenant_id AND mr.actor_id=m.actor_id
      LEFT JOIN roles r ON r.tenant_id=mr.tenant_id AND r.name=mr.role_name AND r.active=1
      LEFT JOIN role_permissions rp ON rp.tenant_id=r.tenant_id AND rp.role_name=r.name
      WHERE m.tenant_id=? AND m.actor_id=? AND m.active=1`,
      )
      .bind(tenantId, actorId)
      .all<{
        professional_id: string | null;
        role_name: string | null;
        permission_code: string | null;
      }>();
    if (!result.results.length) return null;
    return {
      tenantId,
      actorId,
      active: true,
      professionalId: result.results[0].professional_id ?? undefined,
      roles: [
        ...new Set(
          result.results.flatMap((row) =>
            row.role_name ? [row.role_name] : [],
          ),
        ),
      ],
      permissions: [
        ...new Set(
          result.results.flatMap((row) =>
            row.permission_code ? [row.permission_code] : [],
          ),
        ),
      ],
    };
  }
}
