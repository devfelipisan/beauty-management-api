import type { Lead, LeadOrigin, LeadStatus } from "@/modules/leads/domain/lead";
import type { TenantBranding } from "@/modules/tenant-branding/domain/tenant-branding";
import type { AuditEvent } from "@/shared/audit/audit";
import type { Appointment, Customer, Deposit, Payment, Professional, Service, Session, Tenant } from "@/shared/domain/models";
import type { IdempotencyRecord } from "@/shared/idempotency/idempotency";
import type { OutboxEvent, OutboxStatus } from "@/shared/outbox/outbox";

export interface MemorySeedData {
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
}

const DAY = 86_400_000;
const HOUR = 3_600_000;
const REFERENCE = Date.parse("2026-08-10T12:00:00.000Z");

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function id(scope: string, index: number): string {
  return `${scope}-${String(index + 1).padStart(5, "0")}`;
}

const tenantTemplates = [
  { id: "tenant-bella", legalName: "Bella Estetica LTDA", displayName: "Clínica Bella", document: "12345678000199", publicSlug: "clinica-bella", status: "active" as const },
  { id: "tenant-ink", legalName: "Ink Studio LTDA", displayName: "Ink Studio", document: "98765432000199", publicSlug: "ink-studio", status: "active" as const },
  { id: "tenant-essenza", legalName: "Essenza Spa LTDA", displayName: "Essenza Spa", document: "33445566000177", publicSlug: "essenza-spa", status: "trial" as const },
  { id: "tenant-aurora", legalName: "Studio Aurora Estetica LTDA", displayName: "Studio Aurora", document: "55667788000199", publicSlug: "studio-aurora", status: "suspended" as const },
];

const appointmentStatuses: Appointment["status"][] = [
  "awaiting_deposit",
  "awaiting_confirmation",
  "confirmed",
  "checked_in",
  "in_progress",
  "completed",
  "rescheduled",
  "canceled",
  "no_show",
  "expired",
];

const depositStatuses: Deposit["status"][] = [
  "not_required",
  "awaiting_payment",
  "proof_submitted",
  "under_review",
  "confirmed",
  "rejected",
  "expired",
  "refunded",
  "retained",
  "credit",
];

const paymentStatuses: Payment["status"][] = ["pending", "partial", "paid", "refunded", "canceled"];
const paymentMethods: Payment["method"][] = ["cash", "pix", "debit_card", "credit_card", "transfer", "internal_credit"];
const leadStatuses: LeadStatus[] = ["new", "in_contact", "awaiting_customer", "appointment_created", "converted", "no_response", "lost", "duplicate"];
const leadOrigins: LeadOrigin[] = ["landing_contact", "landing_newsletter", "landing_service_interest", "whatsapp", "campaign", "referral", "manual"];

export function createMemoryVolumeSeed(): MemorySeedData {
  const tenants: Tenant[] = tenantTemplates.map((tenant, index) => ({
    ...tenant,
    timezone: "America/Sao_Paulo",
    createdAt: iso(REFERENCE - (240 - index * 25) * DAY),
  }));

  const tenantBranding: TenantBranding[] = tenants.map((tenant) => ({
    tenantId: tenant.id,
    primaryColor: tenant.id === "tenant-ink" ? "#202124" : "#A44F67",
    secondaryColor: tenant.id === "tenant-ink" ? "#6F42C1" : "#C88698",
    updatedAt: iso(REFERENCE - DAY),
  }));

  const professionals: Professional[] = Array.from({ length: 24 }, (_, index) => {
    const tenant = tenants[index % tenants.length];
    return {
      id: id("professional", index),
      tenantId: tenant.id,
      displayName: `Profissional ${String(index + 1).padStart(2, "0")} · ${tenant.displayName}`,
      specialty: tenant.id === "tenant-ink" ? "Tatuagem e projetos autorais" : index % 3 === 0 ? "Laser e estética" : index % 3 === 1 ? "Estética facial" : "Massoterapia e cuidados corporais",
      serviceIds: [],
      active: index !== 23,
      createdAt: iso(REFERENCE - (180 - index) * DAY),
    };
  });

  const services: Service[] = Array.from({ length: 45 }, (_, index) => {
    const tenant = tenants[index % tenants.length];
    const tenantProfessionals = professionals.filter((professional) => professional.tenantId === tenant.id && professional.active);
    const selected = tenantProfessionals.filter((_, professionalIndex) => professionalIndex % 3 === index % 3).map((professional) => professional.id);
    const professionalIds = selected.length ? selected : [tenantProfessionals[0]?.id].filter(Boolean) as string[];
    const depositRequired = index % 3 !== 0;
    return {
      id: id("service", index),
      tenantId: tenant.id,
      name: tenant.id === "tenant-ink" ? `Projeto de tatuagem ${index + 1}` : index % 4 === 0 ? `Massagem terapêutica ${index + 1}` : index % 3 === 0 ? `Procedimento facial ${index + 1}` : `Procedimento laser ${index + 1}`,
      category: tenant.id === "tenant-ink" ? "tatuagem" : index % 4 === 0 ? "massagem" : index % 3 === 0 ? "facial" : "laser",
      durationMinutes: tenant.id === "tenant-ink" ? 120 : 30 + (index % 4) * 15,
      priceCents: 9_000 + index * 1_700 + (tenant.id === "tenant-ink" ? 18_000 : 0),
      active: !(tenant.id === "tenant-aurora" && index > 40),
      professionalIds,
      deposit: { required: depositRequired, type: depositRequired ? "percentage" : "none", value: depositRequired ? (index % 2 === 0 ? 20 : 30) : 0 },
      assessmentRequired: tenant.id === "tenant-ink" || index % 4 === 0,
      createdAt: iso(REFERENCE - (150 - index) * DAY),
    };
  });

  for (const professional of professionals) {
    professional.serviceIds = services.filter((service) => service.tenantId === professional.tenantId && service.professionalIds.includes(professional.id)).map((service) => service.id);
  }

  const profiles: Customer["relationshipProfile"][] = ["new", "returning", "loyal", "inactive", "frequent_no_show"];
  const customers: Customer[] = Array.from({ length: 1_500 }, (_, index) => {
    const tenant = tenants[index % tenants.length];
    return {
      id: id("customer", index),
      tenantId: tenant.id,
      fullName: `Cliente Demonstração ${String(index + 1).padStart(4, "0")}`,
      phone: `55${String(22_900_000_000 + index).padStart(11, "0")}`,
      email: `cliente.${index + 1}@example.test`,
      status: index % 19 === 0 ? "inactive" : index % 47 === 0 ? "blocked" : "active",
      relationshipProfile: profiles[index % profiles.length],
      createdAt: iso(REFERENCE - (540 - (index % 520)) * DAY),
      updatedAt: iso(REFERENCE - (index % 30) * DAY),
    };
  });

  const appointments: Appointment[] = Array.from({ length: 8_000 }, (_, index) => {
    const tenant = tenants[index % tenants.length];
    const tenantProfessionals = professionals.filter((professional) => professional.tenantId === tenant.id && professional.active);
    const professional = tenantProfessionals[index % tenantProfessionals.length];
    const tenantServices = services.filter((service) => service.tenantId === tenant.id && service.active && service.professionalIds.includes(professional.id));
    const service = tenantServices[index % tenantServices.length] ?? services.find((item) => item.tenantId === tenant.id && item.active)!;
    const tenantCustomers = customers.filter((customer) => customer.tenantId === tenant.id);
    const customer = tenantCustomers[index % tenantCustomers.length];
    const sequence = Math.floor(index / tenants.length / Math.max(1, tenantProfessionals.length));
    const dayOffset = (sequence % 540) - 420;
    const slot = sequence % 4;
    const startsAt = REFERENCE + dayOffset * DAY + (slot * 2 - 3) * HOUR;
    const basePriceCents = service.priceCents;
    const discountCents = index % 5 === 0 ? Math.floor(basePriceCents * 0.1) : index % 11 === 0 ? Math.floor(basePriceCents * 0.05) : 0;
    const finalPriceCents = basePriceCents - discountCents;
    const depositCents = service.deposit.required ? Math.floor(finalPriceCents * service.deposit.value / 100) : 0;
    return {
      id: id("appointment", index),
      tenantId: tenant.id,
      customerId: customer.id,
      professionalId: professional.id,
      serviceId: service.id,
      startsAt: iso(startsAt),
      endsAt: iso(startsAt + service.durationMinutes * 60_000),
      status: appointmentStatuses[index % appointmentStatuses.length],
      basePriceCents,
      discountCents,
      finalPriceCents,
      depositCents,
      origin: (["reception", "landing_page", "whatsapp", "return", "campaign", "referral", "manual"] as const)[index % 7],
      createdAt: iso(startsAt - (3 + index % 20) * DAY),
      updatedAt: iso(startsAt - DAY),
    };
  });

  const deposits: Deposit[] = appointments.slice(0, 5_000).map((appointment, index) => ({
    id: id("deposit", index),
    tenantId: appointment.tenantId,
    appointmentId: appointment.id,
    amountCents: appointment.depositCents,
    status: appointment.depositCents === 0 ? "not_required" : depositStatuses[index % depositStatuses.length],
    paymentMethod: index % 3 === 0 ? "pix" : index % 3 === 1 ? "credit_card" : undefined,
    confirmedAt: index % 4 === 0 ? iso(Date.parse(appointment.createdAt) + DAY) : undefined,
    createdAt: appointment.createdAt,
  }));

  const sessionAppointments = appointments.filter((appointment) => appointment.status === "completed" || appointment.status === "in_progress").slice(0, 4_500);
  const sessions: Session[] = sessionAppointments.map((appointment, index) => ({
    id: id("session", index),
    tenantId: appointment.tenantId,
    appointmentId: appointment.id,
    customerId: appointment.customerId,
    professionalId: appointment.professionalId,
    serviceId: appointment.serviceId,
    status: appointment.status === "completed" ? "completed" : "in_progress",
    startedAt: iso(Date.parse(appointment.startsAt) + 5 * 60_000),
    completedAt: appointment.status === "completed" ? iso(Date.parse(appointment.endsAt) - 3 * 60_000) : undefined,
    technicalFormVersion: 1 + (index % 3),
  }));

  const payments: Payment[] = Array.from({ length: 6_500 }, (_, index) => {
    const appointment = appointments[index % appointments.length];
    const session = sessions[index % Math.max(1, sessions.length)];
    const status = paymentStatuses[index % paymentStatuses.length];
    return {
      id: id("payment", index),
      tenantId: appointment.tenantId,
      customerId: appointment.customerId,
      originType: session && session.tenantId === appointment.tenantId && index % 2 === 0 ? "session" : "appointment",
      originId: session && session.tenantId === appointment.tenantId && index % 2 === 0 ? session.id : appointment.id,
      amountCents: Math.max(0, appointment.finalPriceCents - appointment.depositCents),
      method: paymentMethods[index % paymentMethods.length],
      status,
      paidAt: status === "paid" || status === "partial" || status === "refunded" ? iso(Date.parse(appointment.endsAt) + 15 * 60_000) : undefined,
      createdAt: iso(Date.parse(appointment.endsAt) + 10 * 60_000),
    };
  });

  const leads: Lead[] = Array.from({ length: 1_200 }, (_, index) => {
    const tenant = tenants[index % tenants.length];
    const tenantService = services.find((service) => service.tenantId === tenant.id && service.active);
    const status = leadStatuses[index % leadStatuses.length];
    const customer = customers.find((item) => item.tenantId === tenant.id && item.relationshipProfile !== "new");
    const appointment = appointments.find((item) => item.tenantId === tenant.id && item.customerId === customer?.id);
    const createdAt = iso(REFERENCE - (index % 120) * DAY);
    return {
      id: id("lead", index),
      tenantId: tenant.id,
      fullName: `Lead Demonstração ${String(index + 1).padStart(4, "0")}`,
      phone: `55${String(22_980_000_000 + index).padStart(11, "0")}`,
      email: `lead.${index + 1}@example.test`,
      serviceId: index % 3 === 0 ? tenantService?.id : undefined,
      origin: leadOrigins[index % leadOrigins.length],
      privacyConsentAt: createdAt,
      marketingConsentAt: index % 2 === 0 ? createdAt : undefined,
      status,
      customerId: status === "converted" || status === "appointment_created" ? customer?.id : undefined,
      appointmentId: status === "appointment_created" ? appointment?.id : undefined,
      createdAt,
      updatedAt: iso(Date.parse(createdAt) + (index % 7) * DAY),
    };
  });

  const audit: AuditEvent[] = Array.from({ length: 30_000 }, (_, index) => {
    const appointment = appointments[index % appointments.length];
    return {
      id: id("audit", index),
      tenantId: appointment.tenantId,
      actor: { type: index % 11 === 0 ? "system" : "user", id: index % 11 === 0 ? undefined : `seed-actor-${index % 45}` },
      action: ["appointment.created", "deposit.confirmed", "session.started", "session.completed", "payment.registered", "customer.profile.changed"][index % 6],
      resource: { type: "appointment", id: appointment.id },
      requestId: `seed-request-${index + 1}`,
      correlationId: `seed-correlation-${Math.floor(index / 4) + 1}`,
      metadata: { seed: "memory-volume-v1", sequence: index + 1 },
      occurredAt: iso(REFERENCE - (index % 365) * DAY + (index % 24) * HOUR),
    };
  });

  const outbox: OutboxEvent[] = Array.from({ length: 12_000 }, (_, index) => {
    const appointment = appointments[index % appointments.length];
    const status: OutboxStatus = index % 20 === 0 ? "failed" : index % 17 === 0 ? "pending" : index % 23 === 0 ? "processing" : "published";
    const createdAt = iso(REFERENCE - (index % 120) * DAY);
    return {
      id: id("outbox", index),
      tenantId: appointment.tenantId,
      type: ["appointment.created", "deposit.confirmed", "session.completed", "follow-up.due"][index % 4],
      aggregateType: "appointment",
      aggregateId: appointment.id,
      correlationId: `seed-outbox-correlation-${Math.floor(index / 3) + 1}`,
      payload: { appointmentId: appointment.id, seed: true },
      status,
      attempts: status === "failed" ? 3 : status === "published" ? 1 : 0,
      createdAt,
      publishedAt: status === "published" ? iso(Date.parse(createdAt) + HOUR) : undefined,
      lastError: status === "failed" ? "Synthetic provider failure used by the in-memory demo dataset." : undefined,
    };
  });

  const idempotency: IdempotencyRecord[] = Array.from({ length: 8_000 }, (_, index) => {
    const appointment = appointments[index % appointments.length];
    const status: IdempotencyRecord["status"] = index % 31 === 0 ? "failed" : index % 29 === 0 ? "processing" : "completed";
    return {
      id: id("idempotency", index),
      tenantId: appointment.tenantId,
      key: `seed-key-${index + 1}`,
      operation: ["CreateAppointment", "ConfirmDeposit", "StartSession", "CompleteSession", "RegisterPayment"][index % 5],
      requestHash: (0x10000000 + index).toString(16),
      status,
      response: status === "completed" ? { appointmentId: appointment.id } : undefined,
      expiresAt: iso(REFERENCE + 30 * DAY + (index % 30) * DAY),
    };
  });

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
    audit,
    outbox,
    idempotency,
  };
}
