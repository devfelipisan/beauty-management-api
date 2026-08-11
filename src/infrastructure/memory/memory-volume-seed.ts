import type { Lead } from "@/modules/leads/domain/lead";
import type { TenantBranding } from "@/modules/tenant-branding/domain/tenant-branding";
import type { AuditEvent } from "@/shared/audit/audit";
import type { Appointment, Customer, Deposit, Payment, Professional, Service, Session, Tenant } from "@/shared/domain/models";
import type { IdempotencyRecord } from "@/shared/idempotency/idempotency";
import type { OutboxEvent } from "@/shared/outbox/outbox";

export const FALLBACK_TENANT_ID = "00000000-0000-0000-0000-000000000001";
export const FALLBACK_TENANT_SLUG = "bella-estetica-demo";
export const FALLBACK_PROFESSIONAL_ANA_ID = "00000000-0000-0000-0000-000000000101";
export const FALLBACK_PROFESSIONAL_JULIA_ID = "00000000-0000-0000-0000-000000000102";
export const FALLBACK_SERVICE_LASER_ID = "00000000-0000-0000-0000-000000000201";
export const FALLBACK_SERVICE_FACIAL_ID = "00000000-0000-0000-0000-000000000202";
export const FALLBACK_CUSTOMER_MARIA_ID = "00000000-0000-0000-0000-000000000301";
export const FALLBACK_CUSTOMER_CARLA_ID = "00000000-0000-0000-0000-000000000302";

const CREATED_AT = "2026-08-01T12:00:00.000Z";

/**
 * Deterministic fallback dataset used only when API_DATA_SOURCE=memory.
 * It exists to exercise UI/pages and domain flows with PostgreSQL completely disabled.
 * Production remains PostgreSQL by default and never falls back silently.
 */
export function createMemoryVolumeSeed(): {
  tenants: Tenant[];
  tenantBranding: TenantBranding[];
  professionals: Professional[];
  services: Service[];
  customers: Customer[];
  appointments: Appointment[];
  deposits: Deposit[];
  sessions: Session[];
  payments: Payment[];
  leads: Lead[];
  audit: AuditEvent[];
  outbox: OutboxEvent[];
  idempotency: IdempotencyRecord[];
} {
  const tenants: Tenant[] = [{
    id: FALLBACK_TENANT_ID,
    legalName: "Bella Estética Demo LTDA",
    displayName: "Bella Estética Demo",
    document: "00.000.000/0001-00",
    publicSlug: FALLBACK_TENANT_SLUG,
    timezone: "America/Sao_Paulo",
    status: "active",
    createdAt: CREATED_AT,
  }];

  const tenantBranding: TenantBranding[] = [{
    tenantId: FALLBACK_TENANT_ID,
    primaryColor: "#7C3AED",
    secondaryColor: "#EC4899",
    updatedAt: CREATED_AT,
  }];

  const professionals: Professional[] = [
    {
      id: FALLBACK_PROFESSIONAL_ANA_ID,
      tenantId: FALLBACK_TENANT_ID,
      displayName: "Ana Martins",
      specialty: "Depilação a laser",
      serviceIds: [FALLBACK_SERVICE_LASER_ID],
      active: true,
      createdAt: CREATED_AT,
    },
    {
      id: FALLBACK_PROFESSIONAL_JULIA_ID,
      tenantId: FALLBACK_TENANT_ID,
      displayName: "Julia Alves",
      specialty: "Estética facial",
      serviceIds: [FALLBACK_SERVICE_FACIAL_ID],
      active: true,
      createdAt: CREATED_AT,
    },
  ];

  const services: Service[] = [
    {
      id: FALLBACK_SERVICE_LASER_ID,
      tenantId: FALLBACK_TENANT_ID,
      name: "Depilação a laser — Axilas",
      category: "laser",
      durationMinutes: 30,
      priceCents: 12000,
      active: true,
      professionalIds: [FALLBACK_PROFESSIONAL_ANA_ID],
      deposit: { required: true, type: "percentage", value: 30 },
      assessmentRequired: true,
      createdAt: CREATED_AT,
    },
    {
      id: FALLBACK_SERVICE_FACIAL_ID,
      tenantId: FALLBACK_TENANT_ID,
      name: "Limpeza de pele",
      category: "facial",
      durationMinutes: 60,
      priceCents: 18000,
      active: true,
      professionalIds: [FALLBACK_PROFESSIONAL_JULIA_ID],
      deposit: { required: false, type: "none", value: 0 },
      assessmentRequired: false,
      createdAt: CREATED_AT,
    },
  ];

  const customers: Customer[] = [
    {
      id: FALLBACK_CUSTOMER_MARIA_ID,
      tenantId: FALLBACK_TENANT_ID,
      fullName: "Maria Oliveira",
      phone: "22999990001",
      email: "maria.demo@example.com",
      status: "active",
      relationshipProfile: "loyal",
      createdAt: CREATED_AT,
      updatedAt: "2026-08-10T18:00:00.000Z",
    },
    {
      id: FALLBACK_CUSTOMER_CARLA_ID,
      tenantId: FALLBACK_TENANT_ID,
      fullName: "Carla Souza",
      phone: "22999990002",
      email: "carla.demo@example.com",
      status: "active",
      relationshipProfile: "new",
      createdAt: "2026-08-09T15:00:00.000Z",
      updatedAt: "2026-08-09T15:00:00.000Z",
    },
  ];

  const appointments: Appointment[] = [
    {
      id: "00000000-0000-0000-0000-000000000401",
      tenantId: FALLBACK_TENANT_ID,
      customerId: FALLBACK_CUSTOMER_MARIA_ID,
      professionalId: FALLBACK_PROFESSIONAL_ANA_ID,
      serviceId: FALLBACK_SERVICE_LASER_ID,
      startsAt: "2026-08-11T13:00:00.000Z",
      endsAt: "2026-08-11T13:30:00.000Z",
      status: "confirmed",
      basePriceCents: 12000,
      discountCents: 1200,
      finalPriceCents: 10800,
      depositCents: 3240,
      origin: "reception",
      createdAt: "2026-08-10T12:00:00.000Z",
      updatedAt: "2026-08-10T12:00:00.000Z",
    },
    {
      id: "00000000-0000-0000-0000-000000000402",
      tenantId: FALLBACK_TENANT_ID,
      customerId: FALLBACK_CUSTOMER_CARLA_ID,
      professionalId: FALLBACK_PROFESSIONAL_JULIA_ID,
      serviceId: FALLBACK_SERVICE_FACIAL_ID,
      startsAt: "2026-08-11T16:00:00.000Z",
      endsAt: "2026-08-11T17:00:00.000Z",
      status: "awaiting_confirmation",
      basePriceCents: 18000,
      discountCents: 0,
      finalPriceCents: 18000,
      depositCents: 0,
      origin: "landing_page",
      createdAt: "2026-08-10T20:00:00.000Z",
      updatedAt: "2026-08-10T20:00:00.000Z",
    },
    {
      id: "00000000-0000-0000-0000-000000000403",
      tenantId: FALLBACK_TENANT_ID,
      customerId: FALLBACK_CUSTOMER_MARIA_ID,
      professionalId: FALLBACK_PROFESSIONAL_ANA_ID,
      serviceId: FALLBACK_SERVICE_LASER_ID,
      startsAt: "2026-08-08T14:00:00.000Z",
      endsAt: "2026-08-08T14:30:00.000Z",
      status: "completed",
      basePriceCents: 12000,
      discountCents: 1200,
      finalPriceCents: 10800,
      depositCents: 3240,
      origin: "return",
      createdAt: "2026-08-05T12:00:00.000Z",
      updatedAt: "2026-08-08T14:35:00.000Z",
    },
  ];

  const deposits: Deposit[] = [{
    id: "00000000-0000-0000-0000-000000000501",
    tenantId: FALLBACK_TENANT_ID,
    appointmentId: "00000000-0000-0000-0000-000000000401",
    amountCents: 3240,
    status: "confirmed",
    paymentMethod: "pix",
    confirmedAt: "2026-08-10T12:15:00.000Z",
    createdAt: "2026-08-10T12:00:00.000Z",
  }];

  const sessions: Session[] = [{
    id: "00000000-0000-0000-0000-000000000601",
    tenantId: FALLBACK_TENANT_ID,
    appointmentId: "00000000-0000-0000-0000-000000000403",
    customerId: FALLBACK_CUSTOMER_MARIA_ID,
    professionalId: FALLBACK_PROFESSIONAL_ANA_ID,
    serviceId: FALLBACK_SERVICE_LASER_ID,
    status: "completed",
    startedAt: "2026-08-08T14:02:00.000Z",
    completedAt: "2026-08-08T14:28:00.000Z",
    technicalFormVersion: 1,
  }];

  const payments: Payment[] = [{
    id: "00000000-0000-0000-0000-000000000701",
    tenantId: FALLBACK_TENANT_ID,
    customerId: FALLBACK_CUSTOMER_MARIA_ID,
    originType: "session",
    originId: "00000000-0000-0000-0000-000000000601",
    amountCents: 10800,
    method: "pix",
    status: "paid",
    paidAt: "2026-08-08T14:30:00.000Z",
    createdAt: "2026-08-08T14:30:00.000Z",
  }];

  const leads: Lead[] = [
    {
      id: "00000000-0000-0000-0000-000000000801",
      tenantId: FALLBACK_TENANT_ID,
      fullName: "Fernanda Lima",
      phone: "22999990003",
      email: "fernanda.demo@example.com",
      serviceId: FALLBACK_SERVICE_LASER_ID,
      desiredPeriod: "Noite",
      notes: "Interessada em conhecer o plano de sessões.",
      origin: "landing_service_interest",
      privacyConsentAt: "2026-08-11T09:00:00.000Z",
      marketingConsentAt: "2026-08-11T09:00:00.000Z",
      status: "new",
      createdAt: "2026-08-11T09:00:00.000Z",
      updatedAt: "2026-08-11T09:00:00.000Z",
    },
    {
      id: "00000000-0000-0000-0000-000000000802",
      tenantId: FALLBACK_TENANT_ID,
      fullName: "Patrícia Costa",
      phone: "22999990004",
      origin: "whatsapp",
      status: "in_contact",
      createdAt: "2026-08-10T16:00:00.000Z",
      updatedAt: "2026-08-11T10:00:00.000Z",
    },
  ];

  return {
    tenants,
    tenantBranding,
    professionals,
    services,
    customers,
    appointments,
    deposits,
    sessions,
    payments,
    leads,
    audit: [],
    outbox: [],
    idempotency: [],
  };
}
