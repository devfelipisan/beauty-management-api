import type { ApplyDepositTransitionRequest } from '@beauty/contracts';
import type { DeliveryPort, DeliveryResult } from '@beauty/reliability/outbox/outbox-delivery';
import type { OutboxEvent } from '@beauty/reliability/outbox/outbox-event';

type OperationsPort = { applyDepositConfirmed(input:ApplyDepositTransitionRequest):Promise<{applied:boolean}>; applyDepositExpired(input:ApplyDepositTransitionRequest):Promise<{applied:boolean}> };

export class OperationsDepositDelivery implements DeliveryPort {
  constructor(private readonly operations:OperationsPort) {}
  async deliver(event:OutboxEvent):Promise<DeliveryResult> {
    if (!event.tenantId) return {kind:'PERMANENT',errorCode:'OUTBOX_INVALID_TENANT'};
    const payload=event.payload;
    if (event.type !== 'DepositConfirmed' && event.type !== 'DepositExpired') return {kind:'PERMANENT',errorCode:'UNSUPPORTED_EVENT_TYPE'};
    if (typeof payload.appointmentId !== 'string' || typeof payload.depositId !== 'string') return {kind:'PERMANENT',errorCode:'INVALID_DEPOSIT_EVENT_CONTRACT'};
    const input={tenantId:event.tenantId,appointmentId:payload.appointmentId,depositId:payload.depositId,eventId:event.id,correlationId:event.correlationId};
    try { const response=event.type==='DepositConfirmed'?await this.operations.applyDepositConfirmed(input):await this.operations.applyDepositExpired(input); return response.applied?{kind:'DELIVERED'}:{kind:'PERMANENT',errorCode:'DESTINATION_REJECTED'}; } catch { return {kind:'RETRYABLE',errorCode:'DESTINATION_UNAVAILABLE'}; }
  }
}
