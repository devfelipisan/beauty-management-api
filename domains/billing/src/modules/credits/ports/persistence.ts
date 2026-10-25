import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';

export interface CreditsPersistence {
  findCustomerCreditBalances<T = Record<string, unknown>>(
    params: unknown[],
  ): Promise<T | null>;
  stageCustomerCreditBalances(
    context: TransactionalWriteContext,
    options: {
      params: unknown[];
      expectedChanges?: number;
      failureCode?: string;
    },
  ): void;
  stageLedgerMovements(
    context: TransactionalWriteContext,
    options: {
      params: unknown[];
      expectedChanges?: number;
      failureCode?: string;
    },
  ): void;
}
