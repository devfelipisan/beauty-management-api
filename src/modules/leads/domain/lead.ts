import { DomainError, createEntityId, nowIso, type EntityId, type IsoDateTime } from "@/shared/domain/core";

export type LeadStatus =
  | "new"
  | "in_contact"
  | "awaiting_customer"
  | "appointment_created"
  | "converted"
  | "no_response"
  | "lost"
  | "duplicate";

export type LeadOrigin =
  | "landing_contact"
  | "landing_newsletter"
  | "landing_service_interest"
  | "whatsapp"
  | "campaign"
  | "referral"
  | "manual";

export interface Lead {
  id: EntityId;
  tenantId: EntityId;
  fullName: string;
  phone?: string;
  email?: string;
  serviceId?: EntityId;
  professionalId?: EntityId;
  desiredPeriod?: string;
  notes?: string;
  origin: LeadOrigin;
  privacyConsentAt?: IsoDateTime;
  marketingConsentAt?: IsoDateTime;
  status: LeadStatus;
  customerId?: EntityId;
  appointmentId?: EntityId;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface CreateLeadProps {
  tenantId: EntityId;
  fullName: string;
  phone?: string;
  email?: string;
  serviceId?: EntityId;
  professionalId?: EntityId;
  desiredPeriod?: string;
  notes?: string;
  origin: LeadOrigin;
  privacyConsentAt?: IsoDateTime;
  marketingConsentAt?: IsoDateTime;
}

function optionalTrimmed(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function createLead(props: CreateLeadProps): Lead {
  const tenantId = props.tenantId.trim();
  const fullName = props.fullName.trim();
  const phone = optionalTrimmed(props.phone);
  const email = optionalTrimmed(props.email)?.toLowerCase();

  if (!tenantId) throw new DomainError("LEAD_TENANT_REQUIRED", "Tenant is required to create a lead.");
  if (fullName.length < 2) throw new DomainError("LEAD_NAME_INVALID", "Lead full name must contain at least 2 characters.");
  if (!phone && !email) throw new DomainError("LEAD_CONTACT_REQUIRED", "Lead must provide at least one contact channel.");

  const timestamp = nowIso();
  return {
    id: createEntityId(),
    tenantId,
    fullName,
    phone,
    email,
    serviceId: optionalTrimmed(props.serviceId),
    professionalId: optionalTrimmed(props.professionalId),
    desiredPeriod: optionalTrimmed(props.desiredPeriod),
    notes: optionalTrimmed(props.notes),
    origin: props.origin,
    privacyConsentAt: props.privacyConsentAt,
    marketingConsentAt: props.marketingConsentAt,
    status: "new",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
