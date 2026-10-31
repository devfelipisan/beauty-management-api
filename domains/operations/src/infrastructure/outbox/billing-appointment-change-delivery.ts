import type {
  AppointmentFinancialEffectEvent,
  FinancialEffectResult,
} from '@beauty/contracts';
import type {
  DeliveryPort,
  DeliveryResult,
} from '@beauty/reliability/outbox/outbox-delivery';
import type { OutboxEvent } from '@beauty/reliability/outbox/outbox-event';

type Billing = {
  applyAppointmentCanceledFinancialEffects(
    event: AppointmentFinancialEffectEvent,
  ): Promise<FinancialEffectResult>;
  applyAppointmentNoShowFinancialEffects(
    event: AppointmentFinancialEffectEvent,
  ): Promise<FinancialEffectResult>;
};

export class BillingAppointmentChangeDelivery implements DeliveryPort {
  constructor(private readonly billing: Billing) {}
  async deliver(event: OutboxEvent): Promise<DeliveryResult> {
    if (
      !['AppointmentCanceled', 'AppointmentNoShowRecorded'].includes(
        event.type,
      ) ||
      !event.tenantId
    )
      return { kind: 'PERMANENT', errorCode: 'UNSUPPORTED_EVENT_TYPE' };
    try {
      const input = {
        ...event.payload,
        tenantId: event.tenantId,
        eventId: event.id,
        correlationId: event.correlationId,
      } as unknown as AppointmentFinancialEffectEvent;
      const result =
        event.type === 'AppointmentCanceled'
          ? await this.billing.applyAppointmentCanceledFinancialEffects(input)
          : await this.billing.applyAppointmentNoShowFinancialEffects(input);
      // Reconciliation is acknowledged only after Billing committed its durable issue and audit.
      if (
        ['APPLIED', 'REPLAY', 'RECONCILIATION_REQUIRED'].includes(result.status)
      )
        return { kind: 'DELIVERED' };
      return {
        kind: 'PERMANENT',
        errorCode: result.reason ?? 'INVALID_FINANCIAL_EVENT_CONTRACT',
      };
    } catch {
      return { kind: 'RETRYABLE', errorCode: 'BILLING_UNAVAILABLE' };
    }
  }
}
