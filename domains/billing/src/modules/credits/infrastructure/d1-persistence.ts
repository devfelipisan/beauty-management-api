import type { TransactionalWriteContext } from '@beauty/reliability/unit-of-work/transactional-write-context';
import type { D1DatabaseLike } from '@beauty/database/d1/d1.types';
import type { CreditsPersistence } from '../ports/persistence.js';

export class D1CreditsPersistence implements CreditsPersistence {
  constructor(private readonly db: D1DatabaseLike) {}
  findCustomerCreditBalances<T = Record<string, unknown>>(params: unknown[]) {
    return this.db
      .prepare(
        'SELECT available_amount_cents FROM customer_credit_balances WHERE tenant_id=? AND customer_id=?',
      )
      .bind(...params)
      .first<T>();
  }
  stageCustomerCreditBalances(
    context: TransactionalWriteContext,
    options: {
      params: unknown[];
      expectedChanges?: number;
      failureCode?: string;
    },
  ) {
    context.add({
      kind: 'D1_SQL',
      sql: 'INSERT INTO customer_credit_balances (tenant_id,customer_id,available_amount_cents,updated_at) VALUES (?,?,?,?) ON CONFLICT(tenant_id,customer_id) DO UPDATE SET available_amount_cents=available_amount_cents+excluded.available_amount_cents,updated_at=excluded.updated_at',
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
