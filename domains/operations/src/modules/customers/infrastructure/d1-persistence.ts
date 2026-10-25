import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';
import type { CustomersPersistence } from '../ports/persistence.js';

export class D1CustomersPersistence implements CustomersPersistence {

  stageCustomerClinicalRestrictions(
    context: TransactionalWriteContext,
    options: {
      params: unknown[];
      expectedChanges?: number;
      failureCode?: string;
    },
  ) {
    context.add({
      kind: 'D1_SQL',
      sql: "INSERT INTO customer_clinical_restrictions (id,tenant_id,restriction_id,customer_id,source_type,source_id,blocks_new_appointments,requires_reassessment,status,activated_at,resolved_at) VALUES (?, ?, ?, ?, 'INTERCURRERENCE', ?, ?, ?, ?, ?, ?) ON CONFLICT(tenant_id,restriction_id) DO UPDATE SET status=excluded.status,resolved_at=excluded.resolved_at",
      ...options,
    });
  }
}
