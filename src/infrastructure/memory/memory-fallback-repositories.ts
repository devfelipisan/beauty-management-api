import type { CommercialPolicyRepository } from "@/modules/commercial-policy/domain/commercial-policy-repository";
import type { DiscountApproval, DiscountPolicy, RelationshipProfileConfig } from "@/modules/commercial-policy/domain/commercial-policy";
import type { LandingPageRepository } from "@/modules/landing-page/domain/landing-page-repository";
import type { LandingPage } from "@/modules/landing-page/domain/landing-page";
import type { TenantSettingsRepository } from "@/modules/tenant-settings/domain/tenant-settings-repository";
import type { TenantSettings } from "@/modules/tenant-settings/domain/tenant-settings";
import type { PublicTenantContextRepository } from "@/modules/tenants/application/resolve-public-tenant-context";
import type { TenantUserRepository } from "@/modules/users/domain/user-repository";
import type { TenantUser } from "@/modules/users/domain/user";
import type {
  WorkspaceCatalog,
  WorkspaceContextRepository,
  WorkspaceTenantOption,
} from "@/modules/workspace/application/workspace-context";
import {
  FALLBACK_PROFESSIONAL_ANA_ID,
  FALLBACK_PROFESSIONAL_JULIA_ID,
  FALLBACK_SERVICE_FACIAL_ID,
  FALLBACK_SERVICE_LASER_ID,
  FALLBACK_TENANT_ID,
  FALLBACK_TENANT_SLUG,
} from "./memory-volume-seed";

const workspaceTenant: WorkspaceTenantOption = {
  id: FALLBACK_TENANT_ID,
  displayName: "Bella Estética Demo",
  publicSlug: FALLBACK_TENANT_SLUG,
  status: "active",
  roles: [
    { code: "administrator", label: "Administrador" },
    { code: "reception", label: "Recepção" },
    {
      code: "professional",
      label: "Profissional",
      professionals: [
        { id: FALLBACK_PROFESSIONAL_ANA_ID, displayName: "Ana Martins", specialty: "Depilação a laser" },
        { id: FALLBACK_PROFESSIONAL_JULIA_ID, displayName: "Julia Alves", specialty: "Estética facial" },
      ],
    },
  ],
};

export class MemoryWorkspaceContextRepository implements WorkspaceContextRepository {
  async listCatalog(): Promise<WorkspaceCatalog> {
    return { tenants: [structuredClone(workspaceTenant)] };
  }

  async findTenant(tenantId: string): Promise<WorkspaceTenantOption | null> {
    return tenantId === FALLBACK_TENANT_ID ? structuredClone(workspaceTenant) : null;
  }
}

export class MemoryPublicTenantContextRepository implements PublicTenantContextRepository {
  async findByPublicSlug(slug: string) {
    if (slug !== FALLBACK_TENANT_SLUG) return null;
    return {
      tenantId: FALLBACK_TENANT_ID,
      displayName: "Bella Estética Demo",
      publicSlug: FALLBACK_TENANT_SLUG,
      status: "active" as const,
    };
  }
}

export class MemoryTenantSettingsRepository implements TenantSettingsRepository {
  private settings: TenantSettings = {
    tenantId: FALLBACK_TENANT_ID,
    displayName: "Bella Estética Demo",
    legalName: "Bella Estética Demo LTDA",
    document: "00.000.000/0001-00",
    phone: "(22) 99999-0000",
    email: "contato@bella-demo.local",
    address: "Av. Atlântica, 100",
    city: "Macaé",
    state: "RJ",
    postalCode: "27900-000",
    primaryUnitName: "Unidade Centro",
    timezone: "America/Sao_Paulo",
    locale: "pt-BR",
    currency: "BRL",
    weekStartsOn: "monday",
    themeMode: "system",
    interfaceDensity: "comfortable",
    radius: "soft",
    shortName: "Bella Demo",
    showBrandName: true,
    showBreadcrumbs: true,
    showDashboardShortcuts: true,
    compactNavigation: false,
    defaultAgendaView: "week",
    sessionTimeoutMinutes: 60,
    logoutOnInactivity: false,
    privacyContact: "privacidade@bella-demo.local",
    planName: "Fallback / Demo",
    licenseStatus: "active",
    updatedAt: "2026-08-11T10:00:00.000Z",
  };

  async findByTenantId(tenantId: string) {
    return tenantId === FALLBACK_TENANT_ID ? structuredClone(this.settings) : null;
  }

  async save(settings: TenantSettings) {
    this.settings = structuredClone(settings);
    return structuredClone(this.settings);
  }
}

export class MemoryLandingPageRepository implements LandingPageRepository {
  private page: LandingPage = {
    id: "00000000-0000-0000-0000-000000000901",
    tenantId: FALLBACK_TENANT_ID,
    slug: FALLBACK_TENANT_SLUG,
    status: "published",
    template: "editorial_clean",
    brandName: "Bella Estética Demo",
    heroTitle: "Cuidado, tecnologia e beleza em cada sessão",
    heroSubtitle: "Ambiente de demonstração",
    heroDescription: "Massa fallback para validar landing page, agenda e jornada sem conexão com PostgreSQL.",
    ctaLabel: "Conhecer serviços",
    about: "Clínica fictícia usada exclusivamente para testes de interface e fluxos do sistema.",
    whatsapp: "5522999990000",
    phone: "(22) 99999-0000",
    email: "contato@bella-demo.local",
    address: "Macaé - RJ",
    businessHours: "Segunda a sábado, 09h às 19h",
    instagram: "@bella.demo",
    publicServiceIds: [FALLBACK_SERVICE_LASER_ID, FALLBACK_SERVICE_FACIAL_ID],
    publicProfessionalIds: [FALLBACK_PROFESSIONAL_ANA_ID, FALLBACK_PROFESSIONAL_JULIA_ID],
    galleryFileIds: [],
    publishedAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-11T10:00:00.000Z",
  };

  async findByTenantId(tenantId: string) {
    return tenantId === FALLBACK_TENANT_ID ? structuredClone(this.page) : null;
  }

  async save(page: LandingPage) {
    this.page = structuredClone(page);
    return structuredClone(this.page);
  }
}

export class MemoryTenantUserRepository implements TenantUserRepository {
  private readonly users: TenantUser[] = [
    {
      id: "00000000-0000-0000-0000-000000001001",
      tenantId: FALLBACK_TENANT_ID,
      fullName: "Administrador Demo",
      email: "admin@bella-demo.local",
      phone: "22999991001",
      profile: "administrator",
      status: "active",
      lastAccessAt: "2026-08-11T10:00:00.000Z",
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-11T10:00:00.000Z",
    },
    {
      id: "00000000-0000-0000-0000-000000001002",
      tenantId: FALLBACK_TENANT_ID,
      fullName: "Recepção Demo",
      email: "recepcao@bella-demo.local",
      profile: "reception",
      status: "active",
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    },
  ];

  async findById(tenantId: string, id: string) { return this.users.find((item) => item.tenantId === tenantId && item.id === id) ?? null; }
  async findByEmail(tenantId: string, email: string) { return this.users.find((item) => item.tenantId === tenantId && item.email === email.toLowerCase()) ?? null; }
  async list(tenantId: string) { return this.users.filter((item) => item.tenantId === tenantId).map((item) => ({ ...item })); }
  async create(entity: TenantUser) { this.users.push({ ...entity }); return entity; }
  async update(entity: TenantUser) {
    const index = this.users.findIndex((item) => item.tenantId === entity.tenantId && item.id === entity.id);
    if (index < 0) throw new Error(`User ${entity.id} was not found for update.`);
    this.users[index] = { ...entity };
    return entity;
  }
}

export class MemoryCommercialPolicyRepository implements CommercialPolicyRepository {
  private readonly policies: DiscountPolicy[] = [];
  private readonly profiles: RelationshipProfileConfig[] = [];
  private readonly approvals: DiscountApproval[] = [];

  async listRelationshipProfileConfigs(tenantId: string) { return this.profiles.filter((item) => item.tenantId === tenantId); }
  async listDiscountPolicies(tenantId: string) { return this.policies.filter((item) => item.tenantId === tenantId); }
  async listDiscountApprovals(tenantId: string) { return this.approvals.filter((item) => item.tenantId === tenantId); }
  async createDiscountPolicy(entity: DiscountPolicy) { this.policies.push(entity); return entity; }
}
