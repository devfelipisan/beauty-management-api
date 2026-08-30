import type { D1DatabaseLike } from '../../../database/src/d1/d1.types.js';
import type { AuditEvent } from '../audit/audit-event.js';
import type { IdempotencyRecord } from '../idempotency/idempotency-record.js';
import type { OutboxEvent } from '../outbox/outbox-event.js';
import type { TransactionContext } from '../unit-of-work/transaction-context.js';
import type { UnitOfWork } from '../unit-of-work/unit-of-work.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { OutboxWriter } from '../outbox/outbox-writer.js';
import type { IdempotencyStore } from '../idempotency/idempotency-store.js';
import type { TransactionalCommand } from '../unit-of-work/transactional-write-context.js';
export class D1UnitOfWork implements UnitOfWork {
  constructor(private readonly db: D1DatabaseLike) {}
  async execute<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
    const idempotency: IdempotencyRecord[] = []; const audits: AuditEvent[] = []; const outbox: OutboxEvent[] = [];
    const mutations: TransactionalCommand[] = [];
    const context: TransactionContext = {
      idempotency: { find: async (tenantId, operation, key) => idempotency.find((r) => r.tenantId === tenantId && r.operation === operation && r.key === key) ?? null, reserve: async (r) => { idempotency.push(r); }, complete: async (tenantId, operation, key, response) => { const r = idempotency.find((item) => item.tenantId === tenantId && item.operation === operation && item.key === key); if (r) { r.status = 'COMPLETED'; r.response = response; r.updatedAt = new Date().toISOString(); } }, fail: async (tenantId, operation, key) => { const r = idempotency.find((item) => item.tenantId === tenantId && item.operation === operation && item.key === key); if (r) { r.status = 'FAILED'; r.updatedAt = new Date().toISOString(); } } } as IdempotencyStore,
      audit: { append: async (e) => { audits.push(e); } } as AuditWriter,
      outbox: { append: async (e) => { outbox.push(e); } } as OutboxWriter,
      persistence: { add: (command) => { mutations.push(command); } },
    };
    const result = await operation(context);
    const statements = [
      ...mutations.map((m) => this.db.prepare(m.sql).bind(...m.params)),
      ...idempotency.map((r) => this.db.prepare('INSERT INTO idempotency_records (id, tenant_id, operation, idempotency_key, request_hash, status, response_payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(r.id, r.tenantId, r.operation, r.key, r.requestHash, r.status, r.response === undefined ? null : JSON.stringify(r.response), r.createdAt, r.updatedAt)),
      ...audits.map((e) => this.db.prepare('INSERT INTO audit_events (id, tenant_id, actor_id, action, resource_type, resource_id, request_id, correlation_id, metadata_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(e.id, e.tenantId ?? null, e.actorId ?? null, e.action, e.resourceType, e.resourceId ?? null, e.requestId, e.correlationId, e.metadata ? JSON.stringify(e.metadata) : null, e.occurredAt)),
      ...outbox.map((e) => this.db.prepare('INSERT INTO outbox_events (id, tenant_id, event_type, aggregate_type, aggregate_id, correlation_id, payload_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(e.id, e.tenantId ?? null, e.type, e.aggregateType, e.aggregateId, e.correlationId, JSON.stringify(e.payload), e.status, e.createdAt)),
    ];
    if (statements.length) {
      const results = await this.db.batch(statements);
      for (let index = 0; index < mutations.length; index += 1) {
        const result = results[index] as { success?: boolean; changes?: number; meta?: { changes?: number } };
        const mutation = mutations[index];
        if (result?.success === false) throw new Error(mutation.failureCode ?? 'UNIT_OF_WORK_FAILED');
        if (mutation.expectedChanges !== undefined && (result?.meta?.changes ?? result?.changes) !== mutation.expectedChanges) throw new Error(mutation.failureCode ?? 'UNIT_OF_WORK_FAILED');
      }
      if (results.some((r) => (r as { success?: boolean })?.success === false)) throw new Error('UNIT_OF_WORK_FAILED');
    }
    return result;
  }
}
