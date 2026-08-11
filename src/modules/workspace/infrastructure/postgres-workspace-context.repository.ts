import type { SqlClient } from "@/infrastructure/postgres/sql-client";
import type {
  WorkspaceCatalog,
  WorkspaceContextRepository,
  WorkspaceProfessionalOption,
  WorkspaceRoleOption,
  WorkspaceTenantOption,
} from "@/modules/workspace/application/workspace-context";
import type { WorkspaceRole } from "@/shared/application/execution-context";

interface WorkspaceProfessionalRow {
  id: string;
  displayName: string;
  specialty?: string | null;
}

interface WorkspaceRow {
  tenant_id: string;
  display_name: string;
  public_slug: string | null;
  status: WorkspaceTenantOption["status"];
  role_codes: string[] | null;
  professionals: WorkspaceProfessionalRow[] | null;
}

interface QueryResultLike {
  rowCount?: number;
}

const WORKSPACE_SELECT = `
  select
    t.id as tenant_id,
    t.display_name,
    t.public_slug,
    t.status,
    coalesce(
      (
        select jsonb_agg(role_data.code order by role_data.code)
        from (
          select distinct r.code
          from identity.roles r
          where r.tenant_id = t.id
            and r.code in ('tenant_admin','reception','professional')
        ) role_data
      ),
      '[]'::jsonb
    ) as role_codes,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'displayName', p.display_name,
            'specialty', p.specialty
          )
          order by p.display_name, p.id
        )
        from app.professionals p
        where p.tenant_id = t.id
          and p.active = true
      ),
      '[]'::jsonb
    ) as professionals
  from app.tenants t
`;

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

function toTenant(row: WorkspaceRow): WorkspaceTenantOption {
  const professionals: WorkspaceProfessionalOption[] = (row.professionals ?? []).map((professional) => ({
    id: professional.id,
    displayName: professional.displayName,
    specialty: professional.specialty ?? undefined,
  }));

  const roles: WorkspaceRoleOption[] = (row.role_codes ?? [])
    .map(workspaceRole)
    .filter((role): role is WorkspaceRole => role !== undefined)
    .map((role) => ({
      code: role,
      label: label(role),
      professionals: role === "professional" ? professionals : undefined,
    }));

  return {
    id: row.tenant_id,
    displayName: row.display_name,
    publicSlug: row.public_slug ?? undefined,
    status: row.status,
    roles,
  };
}

async function timedQuery<T extends QueryResultLike>(
  operation: string,
  slowQueryThresholdMs: number,
  query: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  const result = await query();
  const durationMs = Date.now() - startedAt;

  if (durationMs >= slowQueryThresholdMs) {
    console.warn("postgres.query.slow", {
      operation,
      durationMs,
      rowCount: result.rowCount,
      thresholdMs: slowQueryThresholdMs,
    });
  }

  return result;
}

export class PostgresWorkspaceContextRepository implements WorkspaceContextRepository {
  constructor(
    private readonly sql: SqlClient,
    private readonly slowQueryThresholdMs = 750,
  ) {}

  async listCatalog(): Promise<WorkspaceCatalog> {
    const result = await timedQuery(
      "workspace.listCatalog",
      this.slowQueryThresholdMs,
      () => this.sql.query<WorkspaceRow>(
        `${WORKSPACE_SELECT}
         where t.status in ('active','trial')
         order by t.display_name, t.id`,
      ),
    );

    return { tenants: result.rows.map(toTenant) };
  }

  async findTenant(tenantId: string): Promise<WorkspaceTenantOption | null> {
    const result = await timedQuery(
      "workspace.findTenant",
      this.slowQueryThresholdMs,
      () => this.sql.query<WorkspaceRow>(
        `${WORKSPACE_SELECT}
         where t.id = $1::uuid
           and t.status in ('active','trial')`,
        [tenantId],
      ),
    );

    return result.rows[0] ? toTenant(result.rows[0]) : null;
  }
}
