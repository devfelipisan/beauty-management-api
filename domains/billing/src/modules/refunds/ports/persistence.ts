import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';

export interface RefundsPersistence {
  findPayments<T = Record<string, unknown>>(
    params: unknown[],
  ): Promise<T | null>;
  stagePayments(
    context: TransactionalWriteContext,
    options: {
      params: unknown[];
      expectedChanges?: number;
      failureCode?: string;
    },
  ): void;
  stageRefunds(
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
