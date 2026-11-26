import type { DemoCatalogLinks } from '../application/create-demo-catalog.js';
import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';

export class D1DemoCatalogLinks implements DemoCatalogLinks {
  stage(transaction: TransactionalWriteContext, tenantId: string, professionalId: string, serviceId: string, at: string): void {
    transaction.add({ kind: 'D1_SQL', expectedChanges: 1,
      sql: `INSERT INTO professional_services (tenant_id,professional_id,service_id,created_at)
        SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM professionals WHERE tenant_id=? AND id=?)
        AND EXISTS (SELECT 1 FROM services WHERE tenant_id=? AND id=?)`,
      params: [tenantId, professionalId, serviceId, at, tenantId, professionalId, tenantId, serviceId] });
  }
}
