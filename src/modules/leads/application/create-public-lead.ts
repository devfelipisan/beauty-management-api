import { DomainError, nowIso } from "@/shared/domain/core";
import { createLead, type Lead, type LeadOrigin } from "../domain/lead";
import type { LeadRepository } from "../domain/lead-repository";

export interface CreatePublicLeadInput {
  fullName: string;
  phone?: string;
  email?: string;
  serviceId?: string;
  professionalId?: string;
  desiredPeriod?: string;
  notes?: string;
  origin: Extract<LeadOrigin, "landing_contact" | "landing_newsletter" | "landing_service_interest">;
  privacyConsent: boolean;
  marketingConsent: boolean;
}

export interface PublicLeadExecutionContext { tenantId: string; }

export class CreatePublicLeadUseCase {
  constructor(private readonly leads: LeadRepository) {}

  async execute(context: PublicLeadExecutionContext, input: CreatePublicLeadInput): Promise<Lead> {
    if (!context.tenantId.trim()) throw new DomainError("LEAD_TENANT_REQUIRED", "Tenant is required to create a public lead.");
    if (!input.privacyConsent) throw new DomainError("LEAD_PRIVACY_CONSENT_REQUIRED", "Privacy consent is required for public lead capture.");
    if (input.origin === "landing_newsletter" && !input.marketingConsent) {
      throw new DomainError("LEAD_MARKETING_CONSENT_REQUIRED", "Marketing consent is required to subscribe to institutional updates.");
    }

    const consentAt = nowIso();
    const lead = createLead({
      tenantId: context.tenantId,
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      serviceId: input.serviceId,
      professionalId: input.professionalId,
      desiredPeriod: input.desiredPeriod,
      notes: input.notes,
      origin: input.origin,
      privacyConsentAt: consentAt,
      marketingConsentAt: input.marketingConsent ? consentAt : undefined,
    });
    return this.leads.create(lead);
  }
}
