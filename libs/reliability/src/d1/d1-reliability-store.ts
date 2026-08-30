import { Inject, Injectable } from '@nestjs/common';
import { D1_DATABASE, type D1DatabaseLike } from '../../../database/src/index.js';
import type { AuditEvent } from '../audit/audit-event.js';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { IdempotencyRecord, IdempotencyStatus } from '../idempotency/idempotency-record.js';
import type { IdempotencyStore } from '../idempotency/idempotency-store.js';
import type { OutboxEvent } from '../outbox/outbox-event.js';
import type { OutboxWriter } from '../outbox/outbox-writer.js';
type IdRow = Omit<IdempotencyRecord, 'tenantId'|'key'|'requestHash'|'status'|'response'|'createdAt'|'updatedAt'|'expiresAt'> & { tenant_id: string; idempotency_key: string; request_hash: string; status: IdempotencyStatus; response_payload?: string; created_at: string; updated_at: string; expires_at?: string };
@Injectable()
export class D1IdempotencyStore implements IdempotencyStore {
  constructor(@Inject(D1_DATABASE) private readonly db: D1DatabaseLike) {}
  async find(tenantId: string, operation: string, key: string) { const r = await this.db.prepare('SELECT * FROM idempotency_records WHERE tenant_id = ? AND operation = ? AND idempotency_key = ?').bind(tenantId, operation, key).first<IdRow>(); return r ? { id: r.id, tenantId: r.tenant_id, operation: r.operation, key: r.idempotency_key, requestHash: r.request_hash, status: r.status, response: r.response_payload ? JSON.parse(r.response_payload) : undefined, createdAt: r.created_at, updatedAt: r.updated_at, expiresAt: r.expires_at } : null; }
  async reserve(r: IdempotencyRecord) { try { await this.db.prepare('INSERT INTO idempotency_records (id, tenant_id, operation, idempotency_key, request_hash, status, response_payload, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)').bind(r.id, r.tenantId, r.operation, r.key, r.requestHash, r.status, r.createdAt, r.updatedAt, r.expiresAt ?? null).run(); } catch { throw new Error('IDEMPOTENCY_KEY_CONFLICT'); } }
  async complete(tenantId: string, operation: string, key: string, response: unknown) { await this.db.prepare('UPDATE idempotency_records SET status = ?, response_payload = ?, updated_at = ? WHERE tenant_id = ? AND operation = ? AND idempotency_key = ?').bind('COMPLETED', JSON.stringify(response), new Date().toISOString(), tenantId, operation, key).run(); }
  async fail(tenantId: string, operation: string, key: string) { await this.db.prepare('UPDATE idempotency_records SET status = ?, updated_at = ? WHERE tenant_id = ? AND operation = ? AND idempotency_key = ?').bind('FAILED', new Date().toISOString(), tenantId, operation, key).run(); }
}
@Injectable() export class D1AuditWriter implements AuditWriter { constructor(@Inject(D1_DATABASE) private readonly db: D1DatabaseLike) {} async append(e: AuditEvent) { await this.db.prepare('INSERT INTO audit_events (id, tenant_id, actor_id, action, resource_type, resource_id, request_id, correlation_id, metadata_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(e.id, e.tenantId ?? null, e.actorId ?? null, e.action, e.resourceType, e.resourceId ?? null, e.requestId, e.correlationId, e.metadata ? JSON.stringify(e.metadata) : null, e.occurredAt).run(); } }
@Injectable() export class D1OutboxWriter implements OutboxWriter { constructor(@Inject(D1_DATABASE) private readonly db: D1DatabaseLike) {} async append(e: OutboxEvent) { await this.db.prepare('INSERT INTO outbox_events (id, tenant_id, event_type, aggregate_type, aggregate_id, correlation_id, payload_json, status, created_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(e.id, e.tenantId ?? null, e.type, e.aggregateType, e.aggregateId, e.correlationId, JSON.stringify(e.payload), e.status, e.createdAt, e.publishedAt ?? null).run(); } }
