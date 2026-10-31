import type { UnitOfWork } from '../unit-of-work/unit-of-work.js';
import type { TransactionalWriteContext } from '../unit-of-work/transactional-write-context.js';

export interface MutationAuditContext {
  actorId: string;
  requestId: string;
  correlationId: string;
}

export async function auditedMutation<T>(
  uow: UnitOfWork | undefined,
  context: MutationAuditContext | undefined,
  event: {
    tenantId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    occurredAt: string;
  },
  mutate: (transaction?: TransactionalWriteContext) => Promise<T>,
): Promise<T> {
  // Legacy Node composition is preserved; Cloudflare explicitly supplies a UnitOfWork.
  if (!uow) return mutate();
  if (!context?.actorId || !context.requestId || !context.correlationId)
    throw new Error('AUTHENTICATION_REQUIRED');
  return uow.execute(async (transaction) => {
    const result = await mutate(transaction.persistence);
    await transaction.audit.append({
      ...event,
      id: crypto.randomUUID(),
      actorId: context.actorId,
      requestId: context.requestId,
      correlationId: context.correlationId,
    });
    return result;
  });
}
