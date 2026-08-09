import type { ExecutionContext } from "@/shared/application/execution-context";
import { executeIdempotent } from "@/shared/application/idempotent-command";
import type { UnitOfWork } from "@/shared/application/ports";
import type { Appointment } from "@/shared/domain/models";
import { createAppointmentInTransaction, type AppointmentCreationOutput } from "@/modules/appointments/application/appointment-creation";

export interface CreateAppointmentInput {
  customerId: string;
  professionalId: string;
  serviceId: string;
  startsAt: string;
  discountCents?: number;
  origin?: Appointment["origin"];
  idempotencyKey: string;
}

export type CreateAppointmentOutput = AppointmentCreationOutput;

export class CreateAppointmentUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async execute(context: ExecutionContext, input: CreateAppointmentInput): Promise<CreateAppointmentOutput> {
    if (!context.tenantId) throw new Error("Tenant is required to create an appointment.");
    return executeIdempotent({
      unitOfWork: this.unitOfWork,
      context,
      operation: "CreateAppointment",
      key: input.idempotencyKey,
      input,
      handler: (transaction) => createAppointmentInTransaction(transaction, context, input),
    });
  }
}
