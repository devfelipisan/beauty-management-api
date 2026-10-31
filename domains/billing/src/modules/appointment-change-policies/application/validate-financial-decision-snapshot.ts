import type { AppointmentChangePoliciesPersistence } from '../ports/persistence.js';
import type {
  FinancialDecisionSnapshotV2,
  FinancialDecisionSnapshotValidation,
} from '@beauty/contracts';
import { financialSnapshotFingerprint } from './build-financial-decision-snapshot.js';
export class ValidateFinancialDecisionSnapshot {
  constructor(private readonly db: AppointmentChangePoliciesPersistence) {}
  async execute(
    tenantId: string,
    snapshot: FinancialDecisionSnapshotV2,
  ): Promise<FinancialDecisionSnapshotValidation> {
    if (
      !snapshot ||
      typeof snapshot !== 'object' ||
      !Array.isArray(snapshot.payments) ||
      snapshot.payments.some((p) => !p || typeof p !== 'object')
    )
      return { status: 'INVALID', reason: 'FINANCIAL_SNAPSHOT_INCOMPLETE' };
    if (snapshot.tenantId !== tenantId)
      return { status: 'INVALID', reason: 'TENANT_MISMATCH' };
    if (
      (snapshot.depositDisposition !== 'NONE' &&
        snapshot.depositAmountCents > 0 &&
        !snapshot.deposit) ||
      snapshot.depositAmountCents < 0 ||
      snapshot.payments.some(
        (p) =>
          !p.paymentId ||
          p.amountCents < 0 ||
          p.refundableAmountCents < 0 ||
          p.amountCents > p.refundableAmountCents ||
          p.paymentVersion < 1,
      )
    )
      return { status: 'INVALID', reason: 'FINANCIAL_SNAPSHOT_INCOMPLETE' };
    if (!snapshot.financialFingerprint)
      return { status: 'INVALID', reason: 'FINANCIAL_SNAPSHOT_INCOMPLETE' };
    const { financialFingerprint, ...content } = snapshot;
    if ((await financialSnapshotFingerprint(content)) !== financialFingerprint)
      return { status: 'INVALID', reason: 'FINANCIAL_FINGERPRINT_CHANGED' };
    if (snapshot.deposit) {
      const row = await this.db.findDepositVersion<{
        version: number;
        status: string;
        amount_cents: number;
      }>([tenantId, snapshot.deposit.id]);
      if (!row) return { status: 'STALE', reason: 'DEPOSIT_VERSION_CHANGED' };
      if (
        row.version !== snapshot.deposit.version ||
        row.status !== snapshot.deposit.status ||
        row.amount_cents !== snapshot.deposit.amountCents
      )
        return { status: 'STALE', reason: 'DEPOSIT_VERSION_CHANGED' };
    }
    if (snapshot.receivable) {
      const row = await this.db.findReceivableVersion<{
        version: number;
        status: string;
        paid_amount_cents: number;
        outstanding_amount_cents: number;
      }>([tenantId, snapshot.receivable.id]);
      if (!row)
        return { status: 'STALE', reason: 'RECEIVABLE_VERSION_CHANGED' };
      if (
        row.version !== snapshot.receivable.version ||
        row.status !== snapshot.receivable.status ||
        row.paid_amount_cents !== snapshot.receivable.paidAmountCents ||
        row.outstanding_amount_cents !==
          snapshot.receivable.outstandingAmountCents
      )
        return { status: 'STALE', reason: 'RECEIVABLE_VERSION_CHANGED' };
    }
    for (const payment of snapshot.payments) {
      const row = await this.db.findPaymentRefundVersion<{
        version: number;
        refunded_amount_cents: number;
      }>([tenantId, payment.paymentId]);
      if (!row) return { status: 'STALE', reason: 'PAYMENT_VERSION_CHANGED' };
      if (row.version !== payment.paymentVersion)
        return { status: 'STALE', reason: 'PAYMENT_VERSION_CHANGED' };
      if (row.refunded_amount_cents !== payment.refundedAmountAtEvaluation)
        return { status: 'STALE', reason: 'PAYMENT_REFUNDABLE_AMOUNT_CHANGED' };
    }
    return { status: 'VALID' };
  }
}
