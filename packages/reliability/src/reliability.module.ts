import { Module } from '@nestjs/common';
import { D1AuditWriter, D1IdempotencyStore, D1OutboxWriter } from './d1/d1-reliability-store.js';
import { D1UnitOfWork } from './d1/d1-unit-of-work.js';
import { AUDIT_WRITER, IDEMPOTENCY_STORE, OUTBOX_WRITER, UNIT_OF_WORK } from './tokens.js';
import { IdempotencyService } from './idempotency/idempotency.service.js';
@Module({ providers: [D1UnitOfWork, D1IdempotencyStore, D1AuditWriter, D1OutboxWriter, IdempotencyService, { provide: UNIT_OF_WORK, useExisting: D1UnitOfWork }, { provide: IDEMPOTENCY_STORE, useExisting: D1IdempotencyStore }, { provide: AUDIT_WRITER, useExisting: D1AuditWriter }, { provide: OUTBOX_WRITER, useExisting: D1OutboxWriter }], exports: [UNIT_OF_WORK, IDEMPOTENCY_STORE, AUDIT_WRITER, OUTBOX_WRITER, IdempotencyService] })
export class ReliabilityModule {}
