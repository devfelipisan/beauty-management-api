import type { SqlClient } from "@/infrastructure/postgres/sql-client";
import type {
  WorkspaceCatalog,
  WorkspaceContextRepository,
  WorkspaceProfessionalOption,
  WorkspaceRoleOption,
  WorkspaceTenantOption,
} from "@/modules/workspace/application/workspace-context";
import type { WorkspaceRole } from "@/shared/application/execution-context";

interface WorkspaceRow {
  tenant_id: string;
  display_name: string;
  public_slug: string | null;
  status: WorkspaceTenantOption["status"];
  role_code: string | null;
  professional_id: string | null;
  professional_display_name: string | null;
  professional_specialty: string | null;
}

interface TenantAccumulator {
  tenant: Omit<WorkspaceTenantOption, "roles">;
  roleCodes: Set<WorkspaceRole>;
  professionals: Map<string, WorkspaceProfessionalOption>;
}

const WORKSPACE_SELECT = `
  select
    t.id as tenant_id,
    t.display_name,
    t.public_slug,
    t.status,
    r.code as role_code,
    p.id as professional_id,
    p.display_name as professional_display_name,
    p.specialty as professional_specialty
  from app.tenants t
  left join identity.roles r
    on r.tenant_id = t.id
   and r.code in ('tenant_admin','reception','professional')
  left join app.professionals p
    on p.tenant_id = t.id
   and p.active = true
`;

function workspaceRole(code: string | null): WorkspaceRole | undefined {
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

function collectTenants(rows: WorkspaceRow[]): WorkspaceTenantOption[] {
  const byTenant = new Map<string, TenantAccumulator>();

  for (const row of rows) {
    let accumulator = byTenant.get(row.tenant_id);
    if (!accumulator) {
      accumulator = {
        tenant: {
          id: row.tenant_id,
          displayName: row.display_name,
          publicSlug: row.public_slug ?? undefined,
          status: row.status,
        },
        roleCodes: new Set<WorkspaceRole>(),
        professionals: new Map<string, WorkspaceProfessionalOption>(),
      };
      byTenant.set(row.tenant_id, accumulator);
    }

    const role = workspaceRole(row.role_code);
    if (role) accumulator.roleCodes.add(role);

    if (row.professional_id && row.professional_display_name) {
      accumulator.professionals.set(row.professional_id, {
        id: row.professional_id,
        displayName: row.professional_display_name,
        specialty: row.professional_specialty ?? undefined,
      });
    }
  }

  return [...byTenant.values()].map(({ tenant, roleCodes, professionals }) => {
    const professionalOptions = [...professionals.values()];
    const roles: WorkspaceRoleOption[] = [...roleCodes].map((role) => ({
      code: role,
      label: label(role),
      professionals: role === "professional" ? professionalOptions : undefined,
    }));
    return { ...tenant, roles };
  });
}

async function timedQuery<T>(labelName: string, query: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await query();
  } finally {
    const durationMs = Date.now() - startedAt;
    if (durationMs >= 1_000) {
      console.warn("Slow PostgreSQL workspace query", { query: labelName, durationMs });
    }
  }
}

export class PostgresWorkspaceContextRepository implements WorkspaceContextRepository {
  constructor(private readonly sql: SqlClient) {}

  async listCatalog(): Promise<WorkspaceCatalog> {
    const result = await timedQuery("workspace.listCatalog", () => this.sql.query<WorkspaceRow>(
      `${WORKSPACE_SELECT}
       where t.status in ('active','trial')
       order by t.display_name, t.id, r.code, p.display_name, p.id`,
    ));

    return { tenants: collectTenants(result.rows) };
  }

  async findTenant(tenantId: string): Promise<WorkspaceTenantOption | null> {
    const result = await timedQuery("workspace.findTenant", () => this.sql.query<WorkspaceRow>(
      `${WORKSPACE_SELECT}
       where t.id = $1::uuid
         and t.status in ('active','trial')
       order by r.code, p.display_name, p.id`,
      [tenantId],
    ));

    return collectTenants(result.rows)[0] ?? null;
  }
}
