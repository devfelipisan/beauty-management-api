import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';

export interface PackageAssignmentRepository {
  assign(
    t: string,
    a: string,
    p: string,
    at: string,
    tx: TransactionalWriteContext,
  ): void;
}
