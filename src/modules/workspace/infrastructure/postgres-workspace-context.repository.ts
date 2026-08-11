import type { SqlClient } from "@/infrastructure/postgres/sql-client";
import type {
  WorkspaceCatalog,
  WorkspaceContextRepository,
  WorkspaceProfessionalOption,
  WorkspaceRoleOption,
  WorkspaceTenantOption,
} from "@/modules/workspace/application/workspace-context";
import type { WorkspaceRole } from "@/shared/application/execution-context";

interface TenantRow {
  id: string;
  display_name: string;
  public_slug: string | null;
  status: WorkspaceTenantOption["status"];
}

interface RoleRow {
  tenant_id: string;
  code: string;
}

interface ProfessionalRow {
  tenant_id: string;
  id: string;
  display_name: string;
  specialty: string | null;
}

function workspaceRole(code: string): WorkspaceRole | undefined {
  if (code === "tenant_admin") return "administrator";
  if (code === "reception") return "reception";
  if (code === "professional") return "professional";
  return undefined;
}

function label(role: WorkspaceRole): string {
  if (role === "administrator") return "Administrador";
  if (role === "reception") return "Recepção";
  return "Profissional";
}

export class PostgresWorkspaceContextRepository implements WorkspaceContextRepository {
  constructor(private readonly sql: SqlClient) {}

  async listCatalog(): Promise<WorkspaceCatalog> {
    const [tenantsResult, rolesResult, professionalsResult] = await Promise.all([
      this.sql.query<TenantRow>(
        `select id, display_name, public_slug, status
         from app.tenants
         where status in ('active','trial')
         order by display_name, id`,
      ),
      this.sql.query<RoleRow>(
        `select tenant_id, code
         from identity.roles
         where code in ('tenant_admin','reception','professional')
         order by tenant_id, code`,
      ),
      this.sql.query<ProfessionalRow>(
        `select tenant_id, id, display_name, specialty
         from app.professionals
         where active = true
         order by tenant_id, display_name, id`,
      ),
    ]);

    const professionalsByTenant = new Map<string, WorkspaceProfessionalOption[]>();
    for (const row of professionalsResult.rows) {
      const items = professionalsByTenant.get(row.tenant_id) ?? [];
      items.push({
        id: row.id,
        displayName: row.display_name,
        specialty: row.specialty ?? undefined,
      });
      professionalsByTenant.set(row.tenant_id, items);
    }

    const rolesByTenant = new Map<string, WorkspaceRoleOption[]>();
    for (const row of rolesResult.rows) {
      const role = workspaceRole(row.code);
      if (!role) continue;
      const items = rolesByTenant.get(row.tenant_id) ?? [];
      if (items.some((item) => item.code === role)) continue;
      items.push({
        code: role,
        label: label(role),
        professionals: role === "professional" ? professionalsByTenant.get(row.tenant_id) ?? [] : undefined,
      });
      rolesByTenant.set(row.tenant_id, items);
    }

    return {
      tenants: tenantsResult.rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        publicSlug: row.public_slug ?? undefined,
        status: row.status,
        roles: rolesByTenant.get(row.id) ?? [],
      })),
    };
  }

  async findTenant(tenantId: string): Promise<WorkspaceTenantOption | null> {
    const catalog = await this.listCatalog();
    return catalog.tenants.find((tenant) => tenant.id === tenantId) ?? null;
  }
}
