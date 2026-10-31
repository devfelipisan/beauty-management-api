import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';
import type { D1DatabaseLike } from '@beauty/database/d1/d1.types';
import type { AppointmentChangePoliciesPersistence } from '../ports/persistence.js';

export class D1AppointmentChangePoliciesPersistence implements AppointmentChangePoliciesPersistence {
  constructor(private readonly db: D1DatabaseLike) {}
  stageReconciliation(context: TransactionalWriteContext, params: unknown[]) {
    context.add({
      kind: 'D1_SQL',
      sql: "INSERT INTO financial_reconciliation_issues (id,tenant_id,source_event_id,appointment_id,issue_type,reason_code,expected_fingerprint,actual_fingerprint,status,created_at) VALUES (?,?,?,?,?,?,?,?,'OPEN',?) ON CONFLICT(tenant_id,source_event_id) DO NOTHING",
      params,
    });
  }
  findAppointmentDeposit<T = Record<string, unknown>>(params: unknown[]) {
    return this.db
      .prepare(
        'SELECT id,status,amount_cents,version FROM deposits WHERE tenant_id=? AND appointment_id=?',
      )
      .bind(...params)
      .first<T>();
  }
  findAppointmentReceivable<T = Record<string, unknown>>(params: unknown[]) {
    return this.db
      .prepare(
        "SELECT id,status,net_amount_cents,paid_amount_cents,outstanding_amount_cents,version FROM receivables WHERE tenant_id=? AND source_type='APPOINTMENT' AND source_id=?",
      )
      .bind(...params)
      .first<T>();
  }
  listRefundablePayments<T = Record<string, unknown>>(params: unknown[]) {
    return this.db
      .prepare(
        'SELECT id,amount_cents,refunded_amount_cents,version FROM payments WHERE tenant_id=? AND receivable_id=? AND amount_cents>refunded_amount_cents ORDER BY received_at ASC,id ASC LIMIT 100',
      )
      .bind(...params)
      .all<T>();
  }
  findCancellationPolicy<T = Record<string, unknown>>(params: unknown[]) {
    return this.db
      .prepare(
        "SELECT * FROM cancellation_policies WHERE tenant_id=? AND (service_id=? OR service_id IS NULL) AND status='ACTIVE' AND effective_from<=? AND (effective_until IS NULL OR effective_until>=?) ORDER BY service_id IS NULL ASC,version DESC LIMIT 1",
      )
      .bind(...params)
      .first<T>();
  }
  findNoShowPolicy<T = Record<string, unknown>>(params: unknown[]) {
    return this.db
      .prepare(
        "SELECT * FROM no_show_policies WHERE tenant_id=? AND (service_id=? OR service_id IS NULL) AND status='ACTIVE' AND effective_from<=? AND (effective_until IS NULL OR effective_until>=?) ORDER BY service_id IS NULL ASC,version DESC LIMIT 1",
      )
      .bind(...params)
      .first<T>();
  }
  findDepositVersion<T = Record<string, unknown>>(params: unknown[]) {
    return this.db
      .prepare(
        'SELECT version,status,amount_cents FROM deposits WHERE tenant_id=? AND id=?',
      )
      .bind(...params)
      .first<T>();
  }
  findReceivableVersion<T = Record<string, unknown>>(params: unknown[]) {
    return this.db
      .prepare(
        'SELECT version,status,paid_amount_cents,outstanding_amount_cents FROM receivables WHERE tenant_id=? AND id=?',
      )
      .bind(...params)
      .first<T>();
  }
  findPaymentRefundVersion<T = Record<string, unknown>>(params: unknown[]) {
    return this.db
      .prepare(
        'SELECT version,refunded_amount_cents FROM payments WHERE tenant_id=? AND id=?',
      )
      .bind(...params)
      .first<T>();
  }
  stageDepositRetention(
    context: TransactionalWriteContext,
    options: {
      params: unknown[];
      expectedChanges?: number;
      failureCode?: string;
    },
  ) {
    context.add({
      kind: 'D1_SQL',
      sql: "UPDATE deposits SET status='RETAINED',version=version+1,updated_at=? WHERE tenant_id=? AND id=? AND status=? AND version=?",
      ...options,
    });
  }
}
