import type { ExecutionContext } from "@/shared/application/execution-context";
import type { UnitOfWork } from "@/shared/application/ports";
import { AuditActions, createAuditEvent } from "@/shared/audit/audit";
import { NotFoundError } from "@/shared/domain/core";
import { createOutboxEvent } from "@/shared/outbox/outbox";
import { createAssessment, type Assessment, type AssessmentResult } from "../domain/assessment";
import type { AssessmentRepository } from "../domain/assessment-repository";

export interface CreateAssessmentInput {
  customerId: string;
  serviceId: string;
  professionalId: string;
  result: AssessmentResult;
  restrictions?: string[];
  validUntil?: string;
}

export class CreateAssessmentUseCase {
  constructor(private readonly unitOfWork: UnitOfWork, private readonly assessments: AssessmentRepository) {}

  async execute(context: ExecutionContext, input: CreateAssessmentInput): Promise<Assessment> {
    if (!context.tenantId) throw new Error("Tenant is required to create an assessment.");
    const tenantId = context.tenantId;
    return this.unitOfWork.execute(context, async (tx) => {
      const [customer, service, professional] = await Promise.all([
        tx.customers.findById(tenantId, input.customerId),
        tx.services.findById(tenantId, input.serviceId),
        tx.professionals.findById(tenantId, input.professionalId),
      ]);
      if (!customer) throw new NotFoundError("customer", input.customerId);
      if (!service) throw new NotFoundError("service", input.serviceId);
      if (!professional) throw new NotFoundError("professional", input.professionalId);
      if (!professional.serviceIds.includes(service.id) || !service.professionalIds.includes(professional.id)) {
        throw new NotFoundError("professional_service_qualification", `${professional.id}:${service.id}`);
      }
      const entity = createAssessment({ ...input, tenantId });
      await this.assessments.create(entity);
      await tx.audit.append(createAuditEvent(context, {
        action: AuditActions.AssessmentCreated,
        resource: { type: "assessment", id: entity.id },
        metadata: { customerId: entity.customerId, serviceId: entity.serviceId, professionalId: entity.professionalId, result: entity.result },
      }));
      await tx.outbox.append(createOutboxEvent({
        tenantId,
        type: "assessment.created",
        aggregateType: "assessment",
        aggregateId: entity.id,
        correlationId: context.correlationId,
        payload: { assessmentId: entity.id, customerId: entity.customerId },
      }));
      return entity;
    });
  }
}
