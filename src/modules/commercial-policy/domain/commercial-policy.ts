import { DomainError, createEntityId, nowIso, type EntityId, type IsoDateTime } from "@/shared/domain/core";
import type { CustomerProfile } from "@/shared/domain/models";

export type DiscountPolicyType = "percentage" | "fixed" | "restriction";
export type DiscountPolicyStatus = "active" | "inactive";
export type DiscountApprovalStatus = "pending" | "approved" | "rejected";

export interface RelationshipProfileConfig {
  profile: CustomerProfile;
  minimumCompletedAppointments?: number;
  periodMonths?: number;
  maximumNoShows?: number;
  inactiveAfterDays?: number;
  manualOverrideAllowed?: boolean;
  updatedAt?: IsoDateTime;
}

export interface DiscountPolicy {
  id: EntityId;
  tenantId: EntityId;
  name: string;
  profile: CustomerProfile;
  type: DiscountPolicyType;
  status: DiscountPolicyStatus;
  percentage?: number;
  fixedAmountCents?: number;
  eligibleServiceIds?: EntityId[];
  eligibleCategories?: string[];
  eligiblePackageIds?: EntityId[];
  minimumAmountCents?: number;
  maximumDiscountCents?: number;
  validFrom?: IsoDateTime;
  validUntil?: IsoDateTime;
  singleUse: boolean;
  requiresApproval: boolean;
  stackable: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface DiscountApproval {
  id: EntityId;
  tenantId: EntityId;
  customerId: EntityId;
  operationType: "appointment" | "package" | "sale";
  operationId?: EntityId;
  requestedBy: EntityId;
  requestedPercentage?: number;
  requestedAmountCents?: number;
  justification: string;
  status: DiscountApprovalStatus;
  decidedBy?: EntityId;
  decidedAt?: IsoDateTime;
  createdAt: IsoDateTime;
}

export interface CreateDiscountPolicyProps {
  tenantId: EntityId;
  name: string;
  profile: CustomerProfile;
  type: DiscountPolicyType;
  percentage?: number;
  fixedAmountCents?: number;
  eligibleServiceIds?: EntityId[];
  eligibleCategories?: string[];
  minimumAmountCents?: number;
  maximumDiscountCents?: number;
  validFrom?: IsoDateTime;
  validUntil?: IsoDateTime;
  singleUse?: boolean;
  requiresApproval?: boolean;
  stackable?: boolean;
}

function nonNegativeInteger(value: number | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) throw new DomainError("DISCOUNT_VALUE_INVALID", `${field} must be a non-negative integer.`, { field });
  return value;
}

export function createDiscountPolicy(props: CreateDiscountPolicyProps): DiscountPolicy {
  const tenantId = props.tenantId.trim();
  const name = props.name.trim();
  if (!tenantId) throw new DomainError("DISCOUNT_TENANT_REQUIRED", "Tenant is required.");
  if (name.length < 2) throw new DomainError("DISCOUNT_POLICY_NAME_INVALID", "Policy name must contain at least 2 characters.");
  if (props.type === "percentage" && (props.percentage === undefined || props.percentage <= 0 || props.percentage > 100)) {
    throw new DomainError("DISCOUNT_PERCENTAGE_INVALID", "Percentage discount must be greater than 0 and at most 100.");
  }
  if (props.type === "fixed" && (props.fixedAmountCents === undefined || !Number.isSafeInteger(props.fixedAmountCents) || props.fixedAmountCents <= 0)) {
    throw new DomainError("DISCOUNT_FIXED_AMOUNT_INVALID", "Fixed discount amount must be a positive integer amount in cents.");
  }

  const timestamp = nowIso();
  return {
    id: createEntityId(),
    tenantId,
    name,
    profile: props.profile,
    type: props.type,
    status: "active",
    percentage: props.type === "percentage" ? props.percentage : undefined,
    fixedAmountCents: props.type === "fixed" ? props.fixedAmountCents : undefined,
    eligibleServiceIds: props.eligibleServiceIds?.filter(Boolean),
    eligibleCategories: props.eligibleCategories?.map((value) => value.trim()).filter(Boolean),
    minimumAmountCents: nonNegativeInteger(props.minimumAmountCents, "minimumAmountCents"),
    maximumDiscountCents: nonNegativeInteger(props.maximumDiscountCents, "maximumDiscountCents"),
    validFrom: props.validFrom,
    validUntil: props.validUntil,
    singleUse: props.singleUse ?? false,
    requiresApproval: props.requiresApproval ?? false,
    stackable: props.stackable ?? false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
