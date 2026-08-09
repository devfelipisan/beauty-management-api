import type { ExecutionContext } from "@/shared/application/execution-context";
import type { UnitOfWork } from "@/shared/application/ports";
import { AuditActions, createAuditEvent } from "@/shared/audit/audit";
import { ForbiddenError, NotFoundError, assertMoneyCents, createEntityId, nowIso } from "@/shared/domain/core";
import type { Service } from "@/shared/domain/models";
import { createOutboxEvent } from "@/shared/outbox/outbox";

export interface CreateServiceInput {
  name: string;
  category: string;
  durationMinutes: number;
  priceCents: number;
  professionalIds: string[];
  active?: boolean;
  deposit?: Service["deposit"];
  assessmentRequired?: boolean;
}

export class CreateServiceUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async execute(context: ExecutionContext, input: CreateServiceInput): Promise<Service> {
    if (!context.tenantId) throw new Error("Tenant is required to create a service.");
    const tenantId = context.tenantId;
    const professionalIds = [...new Set(input.professionalIds)];
    if (input.active !== false && professionalIds.length === 0) {
      throw new ForbiddenError("SERVICE_PROFESSIONAL_REQUIRED", "An active service must have at least one enabled professional.");
    }
    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) throw new Error("Service duration must be greater than zero.");
    const priceCents = assertMoneyCents(input.priceCents, "priceCents");

    return this.unitOfWork.execute(context, async (transaction) => {
      for (const professionalId of professionalIds) {
        const professional = await transaction.professionals.findById(tenantId, professionalId);
        if (!professional) throw new NotFoundError("professional", professionalId);
      }

      const service: Service = {
        id: createEntityId(),
        tenantId,
        name: input.name.trim(),
        category: input.category.trim(),
        durationMinutes: input.durationMinutes,
        priceCents,
        active: input.active ?? true,
        professionalIds,
        deposit: input.deposit ?? { required: false, type: "none", value: 0 },
        assessmentRequired: input.assessmentRequired ?? false,
        createdAt: nowIso(),
      };
      if (service.name.length < 2 || service.category.length < 2) throw new Error("Service name and category are required.");
      if (service.deposit.type === "percentage" && (service.deposit.value < 0 || service.deposit.value > 100)) {
        throw new Error("Deposit percentage must be between 0 and 100.");
      }
      if (service.deposit.type === "fixed") assertMoneyCents(service.deposit.value, "deposit.value");

      await transaction.services.create(service);
      for (const professionalId of professionalIds) {
        const professional = await transaction.professionals.findById(tenantId, professionalId);
        if (professional && !professional.serviceIds.includes(service.id)) {
          await transaction.professionals.update({ ...professional, serviceIds: [...professional.serviceIds, service.id] });
        }
      }
      await transaction.audit.append(createAuditEvent(context, {
        action: AuditActions.ServiceCreated,
        resource: { type: "service", id: service.id },
        metadata: { active: service.active, professionalIds, priceCents, durationMinutes: service.durationMinutes },
      }));
      await transaction.outbox.append(createOutboxEvent({
        tenantId,
        type: "service.created",
        aggregateType: "service",
        aggregateId: service.id,
        correlationId: context.correlationId,
        payload: { serviceId: service.id },
      }));
      return service;
    });
  }
}
