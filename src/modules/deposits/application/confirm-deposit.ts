import { transitionAppointment } from "@/modules/appointments/domain/appointment-state-machine";
import { depositStateMachine } from "@/modules/deposits/domain/deposit-state-machine";
import type { ExecutionContext } from "@/shared/application/execution-context";
import { executeIdempotent } from "@/shared/application/idempotent-command";
import type { UnitOfWork } from "@/shared/application/ports";
import { AuditActions, createAuditEvent } from "@/shared/audit/audit";
import { ConflictError, NotFoundError, nowIso } from "@/shared/domain/core";
import type { Deposit } from "@/shared/domain/models";
import { createOutboxEvent } from "@/shared/outbox/outbox";

export interface ConfirmDepositInput {
  appointmentId: string;
  paymentMethod: string;
  idempotencyKey: string;
}

export class ConfirmDepositUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async execute(context: ExecutionContext, input: ConfirmDepositInput): Promise<Deposit> {
    if (!context.tenantId) throw new Error("Tenant is required to confirm a deposit.");
    const tenantId = context.tenantId;

    return executeIdempotent({
      unitOfWork: this.unitOfWork,
      context,
      operation: "ConfirmDeposit",
      key: input.idempotencyKey,
      input,
      handler: async (transaction) => {
        const appointment = await transaction.appointments.findById(tenantId, input.appointmentId);
        if (!appointment) throw new NotFoundError("appointment", input.appointmentId);
        const deposit = await transaction.deposits.findByAppointmentId(tenantId, appointment.id);
        if (!deposit) throw new NotFoundError("deposit", appointment.id);
        if (deposit.status === "confirmed") return deposit;
        if (deposit.status === "not_required") {
          throw new ConflictError("DEPOSIT_NOT_REQUIRED", "This appointment does not require a deposit.");
        }

        const nextDepositStatus = depositStateMachine.transition(deposit.status, "confirm");
        const nextAppointmentStatus = transitionAppointment(appointment.status, "deposit_confirmed");
        const timestamp = nowIso();
        const confirmed: Deposit = {
          ...deposit,
          status: nextDepositStatus,
          paymentMethod: input.paymentMethod,
          confirmedAt: timestamp,
          confirmedBy: context.actorId,
        };

        await transaction.deposits.update(confirmed);
        await transaction.appointments.update({ ...appointment, status: nextAppointmentStatus, updatedAt: timestamp });
        await transaction.audit.append(createAuditEvent(context, {
          action: AuditActions.DepositConfirmed,
          resource: { type: "deposit", id: confirmed.id },
          metadata: { appointmentId: appointment.id, amountCents: confirmed.amountCents, paymentMethod: input.paymentMethod },
        }));
        await transaction.outbox.append(createOutboxEvent({
          tenantId,
          type: "deposit.confirmed",
          aggregateType: "appointment",
          aggregateId: appointment.id,
          correlationId: context.correlationId,
          payload: { appointmentId: appointment.id, depositId: confirmed.id },
        }));
        return confirmed;
      },
    });
  }
}
