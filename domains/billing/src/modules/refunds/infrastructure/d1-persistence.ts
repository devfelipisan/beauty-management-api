import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';
import type { D1DatabaseLike } from '@beauty/database/d1/d1.types';
import type { RefundsPersistence } from '../ports/persistence.js';

export class D1RefundsPersistence implements RefundsPersistence {
  constructor(private readonly db: D1DatabaseLike) {}
  findPayments<T = Record<string, unknown>>(params: unknown[]) {
    return this.db
      .prepare(
        'SELECT id,tenant_id,receivable_id,customer_id,amount_cents FROM payments WHERE tenant_id=? AND id=?',
      )
      .bind(...params)
      .first<T>();
  }
  stagePayments(
    context: TransactionalWriteContext,
    options: {
      params: unknown[];
      expectedChanges?: number;
      failureCode?: string;
    },
  ) {
    context.add({
      kind: 'D1_SQL',
      sql: 'UPDATE payments SET refunded_amount_cents=refunded_amount_cents+? WHERE tenant_id=? AND id=? AND amount_cents-refunded_amount_cents>=?',
      ...options,
    });
  }
  stageRefunds(
    context: TransactionalWriteContext,
    options: {
      params: unknown[];
      expectedChanges?: number;
      failureCode?: string;
    },
  ) {
    context.add({
      kind: 'D1_SQL',
      sql: "INSERT INTO refunds (id,tenant_id,payment_id,receivable_id,customer_id,amount_cents,reason_code,notes,status,refunded_at,refunded_by,created_at) VALUES (?,?,?,?,?,?,?,? ,'CONFIRMED',?,?,?)",
      ...options,
    });
  }
  stageLedgerMovements(
    context: TransactionalWriteContext,
    options: {
      params: unknown[];
      expectedChanges?: number;
      failureCode?: string;
    },
  ) {
    context.add({
      kind: 'D1_SQL',
      sql: 'INSERT INTO ledger_movements (id,tenant_id,customer_id,receivable_id,type,amount_cents,direction,source_type,source_id,occurred_at,created_by,correlation_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      ...options,
    });
  }
}
