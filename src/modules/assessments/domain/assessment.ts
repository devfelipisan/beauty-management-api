import { DomainError, createEntityId, nowIso, type EntityId, type IsoDateTime } from "@/shared/domain/core";

export type AssessmentResult = "fit" | "fit_with_restrictions" | "not_fit";

export interface Assessment {
  id: EntityId;
  tenantId: EntityId;
  customerId: EntityId;
  serviceId: EntityId;
  professionalId: EntityId;
  result: AssessmentResult;
  restrictions: string[];
  validUntil?: IsoDateTime;
  createdAt: IsoDateTime;
}

export interface CreateAssessmentProps {
  tenantId: EntityId;
  customerId: EntityId;
  serviceId: EntityId;
  professionalId: EntityId;
  result: AssessmentResult;
  restrictions?: string[];
  validUntil?: IsoDateTime;
}

export function createAssessment(props: CreateAssessmentProps): Assessment {
  const tenantId = props.tenantId.trim();
  const customerId = props.customerId.trim();
  const serviceId = props.serviceId.trim();
  const professionalId = props.professionalId.trim();
  if (!tenantId || !customerId || !serviceId || !professionalId) {
    throw new DomainError("ASSESSMENT_REFERENCE_REQUIRED", "Tenant, customer, service and professional are required.");
  }
  const restrictions = [...new Set((props.restrictions ?? []).map((value) => value.trim()).filter(Boolean))];
  if (props.result === "fit_with_restrictions" && restrictions.length === 0) {
    throw new DomainError("ASSESSMENT_RESTRICTIONS_REQUIRED", "At least one restriction is required when the result has restrictions.");
  }
  if (props.validUntil && Number.isNaN(Date.parse(props.validUntil))) {
    throw new DomainError("ASSESSMENT_VALID_UNTIL_INVALID", "Assessment validity must be an ISO date-time.");
  }
  return {
    id: createEntityId(),
    tenantId,
    customerId,
    serviceId,
    professionalId,
    result: props.result,
    restrictions,
    validUntil: props.validUntil,
    createdAt: nowIso(),
  };
}
