import type { Assessment } from "@/modules/assessments/domain/assessment";
import type { Equipment } from "@/modules/equipment/domain/equipment";
import type { FollowUp } from "@/modules/follow-ups/domain/follow-up";
import type { LandingPage } from "@/modules/landing-page/domain/landing-page";
import type { CustomerPackage } from "@/modules/packages/domain/package";
import type { TechnicalRecord } from "@/modules/technical-records/domain/technical-record";
import { createMemoryVolumeSeed } from "./memory-volume-seed";

const DAY = 86_400_000;
const REFERENCE = Date.parse("2026-08-10T12:00:00.000Z");
const iso = (value: number) => new Date(value).toISOString();
const id = (scope: string, index: number) => `${scope}-${String(index + 1).padStart(5, "0")}`;

export interface MemoryContextSeed {
  equipment: Equipment[];
  packages: CustomerPackage[];
  assessments: Assessment[];
  technicalRecords: TechnicalRecord[];
  followUps: FollowUp[];
  landingPages: LandingPage[];
}

export function createMemoryContextSeed(): MemoryContextSeed {
  const core = createMemoryVolumeSeed();

  const equipment: Equipment[] = Array.from({ length: 18 }, (_, index) => {
    const tenant = core.tenants[index % core.tenants.length];
    const serviceIds = core.services.filter((service) => service.tenantId === tenant.id).slice(index % 3, index % 3 + 3).map((service) => service.id);
    return {
      id: id("equipment", index),
      tenantId: tenant.id,
      name: tenant.id === "tenant-ink" ? `Máquina/estação tattoo ${index + 1}` : `Equipamento estético ${index + 1}`,
      model: `MODEL-${100 + index}`,
      manufacturer: index % 2 === 0 ? "DemoMed" : "BeautyTech",
      serialNumber: `SEED-${String(index + 1).padStart(4, "0")}`,
      primaryUnit: tenant.id === "tenant-ink" ? "rpm" : "J/cm²",
      serviceIds,
      status: (["available", "available", "available", "maintenance", "blocked", "inactive"] as const)[index % 6],
      notes: "Registro determinístico da massa in-memory.",
      usageCount: 10 + index * 7,
      lastUsedAt: index % 6 < 3 ? iso(REFERENCE - (index % 20) * DAY) : undefined,
      createdAt: iso(REFERENCE - (250 - index) * DAY),
      updatedAt: iso(REFERENCE - (index % 15) * DAY),
    };
  });

  const packages: CustomerPackage[] = Array.from({ length: 700 }, (_, index) => {
    const customer = core.customers[index % core.customers.length];
    const service = core.services.find((item) => item.tenantId === customer.tenantId && item.active)!;
    const totalSessions = 5 + (index % 8);
    const status = (["active", "active", "active", "expired", "exhausted", "canceled"] as const)[index % 6];
    const usedSessions = status === "exhausted" ? totalSessions : Math.min(totalSessions - 1, index % totalSessions);
    return {
      id: id("package", index),
      tenantId: customer.tenantId,
      customerId: customer.id,
      serviceId: service.id,
      totalSessions,
      usedSessions,
      validUntil: iso(REFERENCE + (status === "expired" ? -20 : 180) * DAY),
      status,
      priceCents: service.priceCents * totalSessions - Math.floor(service.priceCents * totalSessions * 0.1),
      createdAt: iso(REFERENCE - (220 - index % 180) * DAY),
      updatedAt: iso(REFERENCE - (index % 30) * DAY),
    };
  });

  const assessments: Assessment[] = Array.from({ length: 950 }, (_, index) => {
    const customer = core.customers[index % core.customers.length];
    const service = core.services.find((item) => item.tenantId === customer.tenantId)!;
    const professional = core.professionals.find((item) => item.tenantId === customer.tenantId && item.active)!;
    const result = (["fit", "fit", "fit", "fit_with_restrictions", "not_fit"] as const)[index % 5];
    return {
      id: id("assessment", index),
      tenantId: customer.tenantId,
      customerId: customer.id,
      serviceId: service.id,
      professionalId: professional.id,
      result,
      restrictions: result === "fit_with_restrictions" ? [index % 2 === 0 ? "Pele sensibilizada" : "Evitar exposição solar recente"] : [],
      validUntil: iso(REFERENCE + (index % 13 === 0 ? -10 : 90 + index % 60) * DAY),
      createdAt: iso(REFERENCE - (index % 150) * DAY),
    };
  });

  const technicalRecords: TechnicalRecord[] = Array.from({ length: 12_000 }, (_, index) => {
    const session = core.sessions[index % core.sessions.length];
    const tenantEquipment = equipment.filter((item) => item.tenantId === session.tenantId);
    const selectedEquipment = tenantEquipment[index % tenantEquipment.length];
    const ink = session.tenantId === "tenant-ink";
    return {
      id: id("technical-record", index),
      tenantId: session.tenantId,
      sessionId: session.id,
      region: ink ? ["Antebraço", "Braço", "Costas", "Perna"][index % 4] : ["Face", "Axilas", "Virilha", "Pernas"][index % 4],
      equipmentId: selectedEquipment?.id,
      power: ink ? undefined : 12 + (index % 12),
      powerUnit: ink ? undefined : "J/cm²",
      reaction: ink ? ["Pele íntegra", "Sensibilidade leve", "Eritema esperado"][index % 3] : ["Normal", "Eritema leve", "Sensibilidade moderada"][index % 3],
      notes: ink ? `Etapa técnica ${1 + index % 4}; registro de materiais e evolução.` : `Parâmetro histórico da sessão; evolução ${1 + index % 6}.`,
      createdAt: iso(Date.parse(session.startedAt) + (index % 20) * 60_000),
    };
  });

  const followUps: FollowUp[] = Array.from({ length: 2_000 }, (_, index) => {
    const session = core.sessions[index % core.sessions.length];
    const appointment = core.appointments.find((item) => item.id === session.appointmentId)!;
    const status = (["pending", "scheduled", "completed", "canceled"] as const)[index % 4];
    const createdAt = session.completedAt ?? session.startedAt;
    return {
      id: id("follow-up", index),
      tenantId: session.tenantId,
      customerId: session.customerId,
      sessionId: session.id,
      suggestedAt: iso(Date.parse(createdAt) + (21 + index % 45) * DAY),
      reason: index % 2 === 0 ? "Retorno técnico recomendado" : "Acompanhamento de evolução",
      appointmentId: status === "scheduled" ? appointment.id : undefined,
      status,
      createdAt,
      updatedAt: iso(Date.parse(createdAt) + DAY),
    };
  });

  const landingPages: LandingPage[] = core.tenants.map((tenant, index) => ({
    id: `landing-${tenant.id}`,
    tenantId: tenant.id,
    slug: tenant.publicSlug ?? tenant.id,
    status: (["published", "published", "draft", "hidden"] as const)[index],
    template: (["editorial_clean", "minimal", "institutional_light", "editorial_clean"] as const)[index],
    brandName: tenant.displayName,
    heroTitle: "Cuidado, técnica e experiência em cada atendimento",
    heroSubtitle: "Uma experiência personalizada do agendamento ao acompanhamento",
    heroDescription: "Conheça os serviços e profissionais disponíveis.",
    ctaLabel: "Quero receber informações",
    about: `Página pública demonstrativa de ${tenant.displayName}.`,
    whatsapp: "+5522999999999",
    email: `${tenant.publicSlug}@example.test`,
    address: "Macaé - RJ",
    businessHours: "Segunda a sábado, conforme agenda",
    publicServiceIds: core.services.filter((service) => service.tenantId === tenant.id && service.active).slice(0, 6).map((service) => service.id),
    publicProfessionalIds: core.professionals.filter((professional) => professional.tenantId === tenant.id && professional.active).slice(0, 4).map((professional) => professional.id),
    galleryFileIds: [],
    publishedAt: index < 2 ? iso(REFERENCE - 30 * DAY) : undefined,
    updatedAt: iso(REFERENCE - DAY),
  }));

  return { equipment, packages, assessments, technicalRecords, followUps, landingPages };
}
