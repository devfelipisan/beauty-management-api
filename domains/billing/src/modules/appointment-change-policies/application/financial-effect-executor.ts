import type { AppointmentChangePoliciesPersistence } from '../ports/persistence.js';
import type {
  AppointmentFinancialEffectEvent,
  FinancialEffectResult,
} from '@beauty/contracts';
import type { UnitOfWork } from '@beauty/reliability/unit-of-work/unit-of-work';
import type { IdempotencyStore } from '@beauty/reliability/idempotency/idempotency-store';
import { IdempotencyService } from '@beauty/reliability/idempotency/idempotency.service';
import { ValidateFinancialDecisionSnapshot } from './validate-financial-decision-snapshot.js';
import { BuildFinancialDecisionSnapshot } from './build-financial-decision-snapshot.js';

export class FinancialEffectExecutor {
  constructor(
    private readonly db: AppointmentChangePoliciesPersistence,
    private readonly uow: UnitOfWork,
    private readonly ids: IdempotencyStore,
    private readonly idem = new IdempotencyService(),
  ) {}

  async execute(
    event: AppointmentFinancialEffectEvent,
  ): Promise<FinancialEffectResult> {
    return this.uow.execute(async (transaction) => {
      const store: IdempotencyStore = {
        find: (t, o, k) => this.ids.find(t, o, k),
        reserve: (record) => transaction.idempotency.reserve(record),
        complete: (t, o, k, response) =>
          transaction.idempotency.complete(t, o, k, response),
        fail: (t, o, k) => transaction.idempotency.fail(t, o, k),
      };
      const reservation = await this.idem.reserveOrReplay(
        store,
        event.tenantId,
        'APPLY_APPOINTMENT_FINANCIAL_EFFECT',
        event.eventId,
        event,
      );
      if (reservation.replay) {
        const previous = reservation.record.response as FinancialEffectResult;
        return previous.status === 'APPLIED' || previous.status === 'REPLAY'
          ? { status: 'REPLAY', eventId: event.eventId }
          : previous;
      }
      const snapshot = event.financialDecisionSnapshot;
      const validation = await new ValidateFinancialDecisionSnapshot(
        this.db,
      ).execute(event.tenantId, snapshot);
      const unsupported =
        validation.status === 'VALID' &&
        (!['NONE', 'RETAIN'].includes(snapshot.depositDisposition) ||
          snapshot.paymentDisposition !== 'NONE' ||
          snapshot.receivableDisposition !== 'KEEP' ||
          snapshot.creditAmountCents !== 0 ||
          (snapshot.depositDisposition === 'RETAIN' &&
            (!snapshot.deposit || snapshot.deposit.status !== 'CONFIRMED')));
      const at = new Date().toISOString();
      let result: FinancialEffectResult;
      if (validation.status !== 'VALID' || unsupported) {
        const reason = unsupported
          ? 'FINANCIAL_EFFECT_UNAVAILABLE'
          : (validation.reason ?? 'FINANCIAL_SNAPSHOT_INCOMPLETE');
        // Materialize current facts with the frozen policy choice; do not re-evaluate policy.
        const actual =
          validation.status === 'INVALID'
            ? undefined
            : await new BuildFinancialDecisionSnapshot(this.db).execute({
                ...snapshot,
                tenantId: event.tenantId,
                appointmentId: event.appointmentId,
                customerId: event.customerId,
              });
        this.db.stageReconciliation(transaction.persistence, [
          crypto.randomUUID(),
          event.tenantId,
          event.eventId,
          event.appointmentId,
          validation.status === 'STALE'
            ? 'STALE_FINANCIAL_DECISION'
            : 'FINANCIAL_STATE_INCONSISTENT',
          reason,
          typeof snapshot?.financialFingerprint === 'string'
            ? snapshot.financialFingerprint
            : '',
          actual?.financialFingerprint ?? '',
          at,
        ]);
        result = {
          status:
            validation.status === 'INVALID'
              ? 'INVALID'
              : 'RECONCILIATION_REQUIRED',
          reason,
          eventId: event.eventId,
        };
        await transaction.audit.append({
          id: crypto.randomUUID(),
          tenantId: event.tenantId,
          action: 'appointment.financial_reconciliation_required',
          resourceType: 'APPOINTMENT',
          resourceId: event.appointmentId,
          requestId: event.eventId,
          correlationId: event.correlationId,
          occurredAt: at,
          metadata: { reason, sourceEventId: event.eventId },
        });
      } else {
        if (snapshot.depositDisposition === 'RETAIN') {
          this.db.stageDepositRetention(transaction.persistence, {
            failureCode: 'FINANCIAL_DECISION_CONFLICT',
            expectedChanges: 1,
            params: [
              at,
              event.tenantId,
              snapshot.deposit!.id,
              'CONFIRMED',
              snapshot.deposit!.version,
            ],
          });
        }
        result = { status: 'APPLIED', eventId: event.eventId };
        await transaction.audit.append({
          id: crypto.randomUUID(),
          tenantId: event.tenantId,
          action: 'appointment.financial_effect_applied',
          resourceType: 'APPOINTMENT',
          resourceId: event.appointmentId,
          requestId: event.eventId,
          correlationId: event.correlationId,
          occurredAt: at,
          metadata: {
            depositDisposition: snapshot.depositDisposition,
            paymentDisposition: snapshot.paymentDisposition,
            receivableDisposition: snapshot.receivableDisposition,
          },
        });
      }
      await transaction.idempotency.complete(
        event.tenantId,
        'APPLY_APPOINTMENT_FINANCIAL_EFFECT',
        event.eventId,
        result,
      );
      return result;
    });
  }
}
