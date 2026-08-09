import type { ExecutionContext } from "@/shared/application/execution-context";
import { executeIdempotent } from "@/shared/application/idempotent-command";
import type { UnitOfWork } from "@/shared/application/ports";
import { AuditActions, createAuditEvent } from "@/shared/audit/audit";
import { ConflictError, createEntityId, nowIso } from "@/shared/domain/core";
import type { Customer } from "@/shared/domain/models";
import { createOutboxEvent } from "@/shared/outbox/outbox";
import { createAppointmentInTransaction, type AppointmentCreationOutput } from "@/modules/appointments/application/appointment-creation";

export interface CreatePublicAppointmentInput {
  customer: { fullName: string; phone: string; email?: string };
  professionalId: string;
  serviceId: string;
  startsAt: string;
  idempotencyKey: string;
}

export interface CreatePublicAppointmentOutput extends AppointmentCreationOutput { customer: Customer; }

export class CreatePublicAppointmentUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async execute(context: ExecutionContext, input: CreatePublicAppointmentInput): Promise<CreatePublicAppointmentOutput> {
    if (!context.tenantId) throw new Error("Tenant is required to create a public appointment.");
    const tenantId = context.tenantId;
    const fullName = input.customer.fullName.trim();
    const phone = input.customer.phone.trim();
    const email = input.customer.email?.trim().toLowerCase() || undefined;

    return executeIdempotent({
      unitOfWork: this.unitOfWork,
      context,
      operation: "CreatePublicAppointment",
      key: input.idempotencyKey,
      input,
      handler: async (transaction) => {
        const duplicates = await transaction.customers.findDuplicates(tenantId, { fullName, phone, email });
        const exactPhone = duplicates.filter((item) => item.phone === phone);
        const exactEmail = email ? duplicates.filter((item) => item.email === email) : [];
        const exactIds = new Set([...exactPhone, ...exactEmail].map((item) => item.id));
        if (exactIds.size > 1) {
          throw new ConflictError("PUBLIC_CUSTOMER_AMBIGUOUS", "The supplied contact data matches more than one customer.");
        }

        let customer = duplicates.find((item) => exactIds.has(item.id));
        if (!customer) {
          const timestamp = nowIso();
          customer = {
            id: createEntityId(), tenantId, fullName, phone, email, status: "active", relationshipProfile: "new",
            createdAt: timestamp, updatedAt: timestamp,
          };
          await transaction.customers.create(customer);
          await transaction.audit.append(createAuditEvent(context, {
            action: AuditActions.CustomerCreated,
            resource: { type: "customer", id: customer.id },
            metadata: { profile: customer.relationshipProfile, source: "landing_page" },
          }));
          await transaction.outbox.append(createOutboxEvent({
            tenantId, type: "customer.created", aggregateType: "customer", aggregateId: customer.id,
            correlationId: context.correlationId, payload: { customerId: customer.id, source: "landing_page" },
          }));
        }

        const booking = await createAppointmentInTransaction(transaction, context, {
          customerId: customer.id,
          professionalId: input.professionalId,
          serviceId: input.serviceId,
          startsAt: input.startsAt,
          origin: "landing_page",
        });
        return { customer, ...booking };
      },
    });
  }
}
