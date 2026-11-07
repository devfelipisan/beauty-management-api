import type { D1DatabaseLike } from '@beauty/database/d1/d1.types';
import type {
  CatalogKind,
  CatalogRow,
  CatalogReadRepository,
} from '../../application/queries/catalog-page.js';
import { D1CustomerRepository } from '../../modules/customers/infrastructure/d1-customer-repository.js';
import { D1ProfessionalRepository } from '../../modules/professionals/infrastructure/d1-professional-repository.js';
import { D1ServiceRepository } from '../../modules/services/infrastructure/d1-service-repository.js';

/** Read adapter reuses entity mapping and batches persisted relation reads. */
export class D1CatalogReadRepository implements CatalogReadRepository {
  constructor(private readonly db: D1DatabaseLike) {}
  async list(
    kind: CatalogKind,
    tenantId: string,
    limit: number,
    after?: string,
    professionalId?: string,
  ): Promise<CatalogRow[]> {
    let rows: CatalogRow[];
    if (kind === 'customers') {
      rows = (
        await new D1CustomerRepository(this.db).list(tenantId, limit, after)
      ).map((item) => ({ id: item.id, ...item.data }));
    } else if (kind === 'services') {
      rows = (
        await new D1ServiceRepository(this.db).list(tenantId, limit, after)
      ).map((item) => ({ id: item.id, ...item.data }));
    } else {
      const repository = new D1ProfessionalRepository(this.db);
      const items = professionalId
        ? (!after || professionalId > after
            ? [await repository.findById(tenantId, professionalId)]
            : []
          ).filter((item) => item !== null)
        : await repository.list(tenantId, limit, after);
      rows = items.map((item) => ({ id: item.id, ...item.data }));
    }
    if (kind === 'customers' || rows.length === 0) return rows;
    const column = kind === 'professionals' ? 'professional_id' : 'service_id';
    const links = await this.db
      .prepare(
        `SELECT ps.professional_id,ps.service_id FROM professional_services ps JOIN professionals p ON p.tenant_id=ps.tenant_id AND p.id=ps.professional_id JOIN services s ON s.tenant_id=ps.tenant_id AND s.id=ps.service_id WHERE ps.tenant_id=? AND ps.${column} IN (SELECT value FROM json_each(?)) ORDER BY ps.professional_id,ps.service_id`,
      )
      .bind(tenantId, JSON.stringify(rows.map((row) => row.id)))
      .all<{ professional_id: string; service_id: string }>();
    const byId = new Map<string, string[]>();
    for (const link of links.results) {
      const id =
        kind === 'professionals' ? link.professional_id : link.service_id;
      const value =
        kind === 'professionals' ? link.service_id : link.professional_id;
      const values = byId.get(id) ?? [];
      values.push(value);
      byId.set(id, values);
    }
    return rows.map((row) => ({
      ...row,
      [kind === 'professionals' ? 'serviceIds' : 'professionalIds']:
        byId.get(row.id) ?? [],
    }));
  }
}
