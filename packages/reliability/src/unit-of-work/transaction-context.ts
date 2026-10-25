import type { AuditWriter } from '../audit/audit-writer.js';
import type { IdempotencyStore } from '../idempotency/idempotency-store.js';
import type { OutboxWriter } from '../outbox/outbox-writer.js';
import type { TransactionalWriteContext } from './transactional-write-context.js';
export interface TransactionContext { audit: AuditWriter; outbox: OutboxWriter; idempotency: IdempotencyStore; persistence: TransactionalWriteContext; }
