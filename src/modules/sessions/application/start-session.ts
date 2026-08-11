import { transitionAppointment } from "@/modules/appointments/domain/appointment-state-machine";
import type { ExecutionContext } from "@/shared/application/execution-context";
import { executeIdempotent } from "@/shared/application/idempotent-command";
import type { UnitOfWork } from "@/shared/application/ports";
import { AuditActions, createAuditEvent } from "@/shared/audit/audit";
import { ForbiddenError, NotFoundError, createEntityId, nowIso } from "@/shared/domain/core";
import type { Session } from "@/shared/domain/models";
import { createOutboxEvent } from "@/shared/outbox/outbox";

export interface StartSessionInput {
  appointmentId: string;
  technicalFormVersion?: number;
  idempotencyKey: string;
}

export class StartSessionUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async execute(context: ExecutionContext, input: StartSessionInput): Promise<Session> {
    if (!context.tenantId) throw new Error("Tenant is required to start a session.");
    const tenantId = context.tenantId;
    return executeIdempotent({
      unitOfWork: this.unitOfWork,
      context,
      operation: "StartSession",
      key: input.idempotencyKey,
      input,
      handler: async (transaction) => {
        const appointment = await transaction.appointments.findById(tenantId, input.appointmentId);
        if (!appointment) throw new NotFoundError("appointment", input.appointmentId);
        if (context.professionalId && appointment.professionalId !== context.professionalId) {
          throw new ForbiddenError(
            "PROFESSIONAL_APPOINTMENT_FORBIDDEN",
            "A professional can start only sessions assigned to their own professional profile.",
            { appointmentId: appointment.id },
          );
        }
        const existing = await transaction.sessions.findByAppointmentId(tenantId, appointment.id);
        if (existing) return existing;
        const nextAppointmentStatus = transitionAppointment(appointment.status, "start_session");
        const professional = await transaction.professionals.findById(tenantId, appointment.professionalId);
        if (!professional?.active) throw new ForbiddenError("PROFESSIONAL_NOT_ALLOWED", "Professional is inactive or unavailable.");
        const session: Session = {
          id: createEntityId(), tenantId, appointmentId: appointment.id, customerId: appointment.customerId,
          professionalId: appointment.professionalId, serviceId: appointment.serviceId, status: "in_progress",
          startedAt: nowIso(), technicalFormVersion: input.technicalFormVersion ?? 1,
        };
        await transaction.sessions.create(session);
        await transaction.appointments.update({ ...appointment, status: nextAppointmentStatus, updatedAt: nowIso() });
        await transaction.audit.append(createAuditEvent(context, {
          action: AuditActions.SessionStarted,
          resource: { type: "session", id: session.id },
          metadata: { appointmentId: appointment.id, serviceId: appointment.serviceId, professionalId: appointment.professionalId },
        }));
        await transaction.outbox.append(createOutboxEvent({
          tenantId, type: "session.started", aggregateType: "session", aggregateId: session.id,
          correlationId: context.correlationId, payload: { sessionId: session.id, appointmentId: appointment.id },
        }));
        return session;
      },
    });
  }
}
