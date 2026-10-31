import type { TransactionalWriteContext } from '../unit-of-work/transactional-write-context.js';

export interface MediaReservation {
  objectKey: string;
  tenantId: string;
  domain: 'clinical' | 'profile';
  resourceId: string;
  operation: string;
  idempotencyKey: string;
  sizeBytes: number;
}
/** Database triggers enforce global and tenant budgets in the caller's batch. */
export function reserveMedia(
  input: MediaReservation,
  tx: TransactionalWriteContext,
): void {
  const now = new Date().toISOString();
  tx.add({
    kind: 'D1_SQL',
    expectedChanges: 1,
    sql: "INSERT INTO media_objects (object_key,tenant_id,domain,resource_id,operation,idempotency_key,size_bytes,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'RESERVED',?,?)",
    params: [
      input.objectKey,
      input.tenantId,
      input.domain,
      input.resourceId,
      input.operation,
      input.idempotencyKey,
      input.sizeBytes,
      now,
      now,
    ],
  });
}
export function transitionMedia(
  tenantId: string,
  objectKey: string,
  from: string,
  to: string,
  tx: TransactionalWriteContext,
): void {
  tx.add({
    kind: 'D1_SQL',
    expectedChanges: 1,
    sql: 'UPDATE media_objects SET status=?,updated_at=? WHERE tenant_id=? AND object_key=? AND status=?',
    params: [to, new Date().toISOString(), tenantId, objectKey, from],
  });
}
