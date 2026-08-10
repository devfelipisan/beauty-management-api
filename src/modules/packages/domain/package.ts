import { DomainError, createEntityId, nowIso, type EntityId, type IsoDateTime, type MoneyCents } from "@/shared/domain/core";

export type PackageStatus = "active" | "expired" | "exhausted" | "canceled";

export interface CustomerPackage {
  id: EntityId;
  tenantId: EntityId;
  customerId: EntityId;
  serviceId: EntityId;
  totalSessions: number;
  usedSessions: number;
  validUntil?: IsoDateTime;
  status: PackageStatus;
  priceCents?: MoneyCents;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CreatePackageProps {
  tenantId: EntityId;
  customerId: EntityId;
  serviceId: EntityId;
  totalSessions: number;
  validUntil?: IsoDateTime;
  priceCents?: MoneyCents;
}

export function createPackage(props: CreatePackageProps): CustomerPackage {
  if (!props.tenantId.trim()) throw new DomainError("PACKAGE_TENANT_REQUIRED", "Tenant is required to create a package.");
  if (!props.customerId.trim()) throw new DomainError("PACKAGE_CUSTOMER_REQUIRED", "Customer is required to create a package.");
  if (!props.serviceId.trim()) throw new DomainError("PACKAGE_SERVICE_REQUIRED", "Service is required to create a package.");
  if (!Number.isInteger(props.totalSessions) || props.totalSessions <= 0 || props.totalSessions > 1000) {
    throw new DomainError("PACKAGE_SESSION_COUNT_INVALID", "Package total sessions must be an integer between 1 and 1000.");
  }
  if (props.priceCents !== undefined && (!Number.isInteger(props.priceCents) || props.priceCents < 0)) {
    throw new DomainError("PACKAGE_PRICE_INVALID", "Package price must be a non-negative integer amount in cents.");
  }
  if (props.validUntil && !Number.isFinite(Date.parse(props.validUntil))) {
    throw new DomainError("PACKAGE_VALID_UNTIL_INVALID", "Package expiration date is invalid.");
  }

  const timestamp = nowIso();
  return {
    id: createEntityId(),
    tenantId: props.tenantId.trim(),
    customerId: props.customerId.trim(),
    serviceId: props.serviceId.trim(),
    totalSessions: props.totalSessions,
    usedSessions: 0,
    validUntil: props.validUntil,
    status: "active",
    priceCents: props.priceCents,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
