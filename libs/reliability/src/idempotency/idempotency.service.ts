import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { IdempotencyRecord } from './idempotency-record.js';
import type { IdempotencyStore } from './idempotency-store.js';
export class IdempotencyKeyConflictError extends Error { constructor() { super('IDEMPOTENCY_KEY_CONFLICT'); } }
export class IdempotencyInProgressError extends Error { constructor() { super('IDEMPOTENCY_OPERATION_IN_PROGRESS'); } }
@Injectable()
export class IdempotencyService {
  hash(input: unknown): string { return createHash('sha256').update(JSON.stringify(input)).digest('hex'); }
  async reserveOrReplay(store: IdempotencyStore, tenantId: string, operation: string, key: string, input: unknown, now = new Date().toISOString()): Promise<{ record: IdempotencyRecord; replay: boolean }> {
    if (!key.trim()) throw new Error('IDEMPOTENCY_KEY_REQUIRED');
    const requestHash = this.hash(input); const existing = await store.find(tenantId, operation, key);
    if (existing) { if (existing.requestHash !== requestHash) throw new IdempotencyKeyConflictError(); if (existing.status === 'COMPLETED') return { record: existing, replay: true }; throw new IdempotencyInProgressError(); }
    const record: IdempotencyRecord = { id: crypto.randomUUID(), tenantId, operation, key, requestHash, status: 'PROCESSING', createdAt: now, updatedAt: now }; await store.reserve(record); return { record, replay: false };
  }
}
