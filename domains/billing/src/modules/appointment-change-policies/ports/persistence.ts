import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';

export interface AppointmentChangePoliciesPersistence {
  stageReconciliation(
    context: TransactionalWriteContext,
    params: unknown[],
  ): void;
  findAppointmentDeposit<T = Record<string, unknown>>(
    params: unknown[],
  ): Promise<T | null>;
  findAppointmentReceivable<T = Record<string, unknown>>(
    params: unknown[],
  ): Promise<T | null>;
  listRefundablePayments<T = Record<string, unknown>>(
    params: unknown[],
  ): Promise<{ results: T[] }>;
  findCancellationPolicy<T = Record<string, unknown>>(
    params: unknown[],
  ): Promise<T | null>;
  findNoShowPolicy<T = Record<string, unknown>>(
    params: unknown[],
  ): Promise<T | null>;
  findDepositVersion<T = Record<string, unknown>>(
    params: unknown[],
  ): Promise<T | null>;
  findReceivableVersion<T = Record<string, unknown>>(
    params: unknown[],
  ): Promise<T | null>;
  findPaymentRefundVersion<T = Record<string, unknown>>(
    params: unknown[],
  ): Promise<T | null>;
  stageDepositRetention(
    context: TransactionalWriteContext,
    options: {
      params: unknown[];
      expectedChanges?: number;
      failureCode?: string;
    },
  ): void;
}
