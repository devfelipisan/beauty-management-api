import type { D1DatabaseLike } from '@beauty/database/d1/d1.types';
import { workspaceRole, type WorkspaceRole } from '../workspace-authority.js';

const readPermissions = [
  'agenda.read',
  'customer.read',
  'professional.read',
  'service.read',
];
const roleNames = {
  administrator: 'tenant_admin',
  reception: 'reception',
  professional: 'professional',
} as const;
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
export interface SelectorReadAuthority {
  mode: 'selector';
  tenantId: string;
  selectedRole: WorkspaceRole;
  professionalId?: string;
  permissions: string[];
}

/** Pre-login selection is a read context, never an identity or membership. */
export class D1SelectorWorkspaceProvider {
  constructor(private readonly db: D1DatabaseLike) {}

  async catalog() {
    const rows = await this.db
      .prepare(
        `SELECT t.id,t.display_name,t.status,r.name AS role_name,p.id AS professional_id,p.name AS professional_name
      FROM tenants t JOIN roles r ON r.tenant_id=t.id AND r.active=1
      LEFT JOIN professionals p ON r.name='professional' AND p.tenant_id=t.id AND p.status='ACTIVE'
      WHERE t.status='ACTIVE' AND EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.tenant_id=t.id AND rp.role_name=r.name AND rp.permission_code IN ('agenda.read','customer.read','professional.read','service.read'))
      ORDER BY t.id,r.name,p.id`,
      )
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
          code: WorkspaceRole;
          label: string;
          professionals?: { id: string; displayName: string }[];
        }[];
      }
    >();
    for (const row of rows.results) {
      const code = workspaceRole(row.role_name);
      if (!code || (code === 'professional' && !row.professional_id)) continue;
      const tenant = tenants.get(row.id) ?? {
        id: row.id,
        displayName: row.display_name,
        status: row.status,
        roles: [],
      };
      let role = tenant.roles.find((item) => item.code === code);
      if (!role) {
        role = {
          code,
          label:
            code === 'administrator'
              ? 'Administração'
              : code === 'reception'
                ? 'Recepção'
                : 'Profissional',
          ...(code === 'professional' ? { professionals: [] } : {}),
        };
        tenant.roles.push(role);
      }
      if (code === 'professional')
        role.professionals!.push({
          id: row.professional_id!,
          displayName: row.professional_name!,
        });
      tenants.set(row.id, tenant);
    }
    return { tenants: [...tenants.values()] };
  }

  async resolve(
    tenantId: string,
    role: string | null,
    professionalId?: string,
  ): Promise<SelectorReadAuthority> {
    if (!idPattern.test(tenantId) || !role || !Object.hasOwn(roleNames, role))
      throw new Error('PERMISSION_DENIED');
    if (
      role === 'professional'
        ? !professionalId || !idPattern.test(professionalId)
        : professionalId !== undefined
    )
      throw new Error('PERMISSION_DENIED');
    const selectedRole = role as WorkspaceRole;
    const rows = await this.db
      .prepare(
        `SELECT rp.permission_code FROM tenants t
      JOIN roles r ON r.tenant_id=t.id AND r.active=1
      JOIN role_permissions rp ON rp.tenant_id=r.tenant_id AND rp.role_name=r.name
      WHERE t.id=? AND t.status='ACTIVE' AND r.name=?
      AND (? IS NULL OR EXISTS (SELECT 1 FROM professionals p WHERE p.tenant_id=t.id AND p.id=? AND p.status='ACTIVE'))`,
      )
      .bind(
        tenantId,
        roleNames[selectedRole],
        professionalId ?? null,
        professionalId ?? null,
      )
      .all<{ permission_code: string }>();
    const permissions = rows.results
      .map((row) => row.permission_code)
      .filter((permission) => readPermissions.includes(permission));
    if (!permissions.length) throw new Error('PERMISSION_DENIED');
    return {
      mode: 'selector',
      tenantId,
      selectedRole,
      professionalId,
      permissions,
    };
  }
}
