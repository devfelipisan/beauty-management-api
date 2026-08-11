import type {
  OperationalTenantContext,
  OperationalTenantContextRepository,
} from "@/modules/tenants/application/resolve-operational-tenant-context";
import type { SqlClient } from "@/infrastructure/postgres/sql-client";

interface TenantRow {
  tenant_id: string;
  display_name: string;
  public_slug: string | null;
  status: OperationalTenantContext["status"];
}

function mapTenant(row: TenantRow): OperationalTenantContext {
  return {
    tenantId: row.tenant_id,
    displayName: row.display_name,
    publicSlug: row.public_slug ?? undefined,
    status: row.status,
  };
}

export class PostgresOperationalTenantContextRepository implements OperationalTenantContextRepository {
  constructor(private readonly sql: SqlClient) {}

  async findById(tenantId: string): Promise<OperationalTenantContext | null> {
    const result = await this.sql.query<TenantRow>(
      `select id as tenant_id, display_name, public_slug, status
       from app.tenants
       where id = $1::uuid
       limit 1`,
      [tenantId],
    );
    return result.rows[0] ? mapTenant(result.rows[0]) : null;
  }

  async listOperational(): Promise<OperationalTenantContext[]> {
    const result = await this.sql.query<TenantRow>(
      `select id as tenant_id, display_name, public_slug, status
       from app.tenants
       where status in ('active','trial')
       order by created_at, id`,
    );
    return result.rows.map(mapTenant);
  }
}
