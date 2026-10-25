import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';

export interface CustomersPersistence {
  stageCustomerClinicalRestrictions(
    context: TransactionalWriteContext,
    options: {
      params: unknown[];
      expectedChanges?: number;
      failureCode?: string;
    },
  ): void;
}
