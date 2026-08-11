import { transitionAppointment } from "@/modules/appointments/domain/appointment-state-machine";
import { sessionStateMachine } from "@/modules/sessions/domain/session-state-machine";
import type { ExecutionContext } from "@/shared/application/execution-context";
import { executeIdempotent } from "@/shared/application/idempotent-command";
import type { UnitOfWork } from "@/shared/application/ports";
import { AuditActions, createAuditEvent } from "@/shared/audit/audit";
import { ForbiddenError, NotFoundError, nowIso } from "@/shared/domain/core";
import type { Session } from "@/shared/domain/models";
import { createOutboxEvent } from "@/shared/outbox/outbox";

export interface CompleteSessionInput { sessionId: string; idempotencyKey: string; }

export class CompleteSessionUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async execute(context: ExecutionContext, input: CompleteSessionInput): Promise<Session> {
    if (!context.tenantId) throw new Error("Tenant is required to complete a session.");
    const tenantId = context.tenantId;
    return executeIdempotent({
      unitOfWork: this.unitOfWork,
      context,
      operation: "CompleteSession",
      key: input.idempotencyKey,
      input,
      handler: async (transaction) => {
        const session = await transaction.sessions.findById(tenantId, input.sessionId);
        if (!session) throw new NotFoundError("session", input.sessionId);
        if (context.professionalId && session.professionalId !== context.professionalId) {
          throw new ForbiddenError(
            "PROFESSIONAL_SESSION_FORBIDDEN",
            "A professional can complete only sessions assigned to their own professional profile.",
            { sessionId: session.id },
          );
        }
        if (session.status === "completed") return session;
        const appointment = await transaction.appointments.findById(tenantId, session.appointmentId);
        if (!appointment) throw new NotFoundError("appointment", session.appointmentId);
        const nextSessionStatus = sessionStateMachine.transition(session.status, "complete");
        const nextAppointmentStatus = transitionAppointment(appointment.status, "complete");
        const completedAt = nowIso();
        const completed: Session = { ...session, status: nextSessionStatus, completedAt };
        await transaction.sessions.update(completed);
        await transaction.appointments.update({ ...appointment, status: nextAppointmentStatus, updatedAt: completedAt });
        await transaction.audit.append(createAuditEvent(context, {
          action: AuditActions.SessionCompleted,
          resource: { type: "session", id: session.id },
          metadata: { appointmentId: appointment.id, completedAt },
        }));
        await transaction.outbox.append(createOutboxEvent({
          tenantId, type: "session.completed", aggregateType: "session", aggregateId: session.id,
          correlationId: context.correlationId, payload: { sessionId: session.id, appointmentId: appointment.id },
        }));
        return completed;
      },
    });
  }
}
