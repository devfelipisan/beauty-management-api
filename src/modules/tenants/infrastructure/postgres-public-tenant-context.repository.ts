import type { PublicTenantContext, PublicTenantContextRepository } from "@/modules/tenants/application/resolve-public-tenant-context";
import type { SqlClient } from "@/infrastructure/postgres/sql-client";

interface PublicTenantRow {
  tenant_id: string;
  display_name: string;
  public_slug: string;
  status: PublicTenantContext["status"];
}

export class PostgresPublicTenantContextRepository implements PublicTenantContextRepository {
  constructor(private readonly sql: SqlClient) {}

  async findByPublicSlug(slug: string): Promise<PublicTenantContext | null> {
    const result = await this.sql.query<PublicTenantRow>(
      `select id as tenant_id, display_name, public_slug, status
       from app.tenants
       where public_slug = $1
       limit 1`,
      [slug],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      tenantId: row.tenant_id,
      displayName: row.display_name,
      publicSlug: row.public_slug,
      status: row.status,
    };
  }
}
