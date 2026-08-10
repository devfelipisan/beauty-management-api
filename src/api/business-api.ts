import { CreateAppointmentUseCase, type CreateAppointmentInput } from "@/modules/appointments/application/create-appointment";
import { CreatePublicAppointmentUseCase, type CreatePublicAppointmentInput } from "@/modules/appointments/application/create-public-appointment";
import { allowedAppointmentActions } from "@/modules/appointments/domain/appointment-state-machine";
import { CreateCustomerUseCase, type CreateCustomerInput } from "@/modules/customers/application/create-customer";
import { ConfirmDepositUseCase, type ConfirmDepositInput } from "@/modules/deposits/application/confirm-deposit";
import { CreateEquipmentUseCase, type CreateEquipmentInput } from "@/modules/equipment/application/create-equipment";
import type { EquipmentRepository } from "@/modules/equipment/domain/equipment-repository";
import { HideLandingPageUseCase, PublishLandingPageUseCase, SaveLandingPageDraftUseCase } from "@/modules/landing-page/application/manage-landing-page";
import type { LandingPageRepository } from "@/modules/landing-page/domain/landing-page-repository";
import type { SaveLandingPageDraftInput } from "@/modules/landing-page/domain/landing-page";
import { CreatePublicLeadUseCase, type CreatePublicLeadInput } from "@/modules/leads/application/create-public-lead";
import { UpdateLeadStatusUseCase, type UpdateLeadStatusInput } from "@/modules/leads/application/update-lead-status";
import type { LeadRepository } from "@/modules/leads/domain/lead-repository";
import { allowedLeadActions } from "@/modules/leads/domain/lead-state-machine";
import { CreatePackageUseCase, type CreatePackageInput } from "@/modules/packages/application/create-package";
import type { PackageRepository } from "@/modules/packages/domain/package-repository";
import { RegisterPaymentUseCase, type RegisterPaymentInput } from "@/modules/payments/application/register-payment";
import { CreateProfessionalUseCase, type CreateProfessionalInput } from "@/modules/professionals/application/create-professional";
import { CreateServiceUseCase, type CreateServiceInput } from "@/modules/services/application/create-service";
import { CompleteSessionUseCase, type CompleteSessionInput } from "@/modules/sessions/application/complete-session";
import { StartSessionUseCase, type StartSessionInput } from "@/modules/sessions/application/start-session";
import { UpdateTenantBrandingUseCase, type UpdateTenantBrandingInput } from "@/modules/tenant-branding/application/update-tenant-branding";
import { UpdateTenantSettingsUseCase } from "@/modules/tenant-settings/application/update-tenant-settings";
import type { TenantSettingsRepository } from "@/modules/tenant-settings/domain/tenant-settings-repository";
import type { UpdateTenantSettingsInput } from "@/modules/tenant-settings/domain/tenant-settings";
import { CreateTenantUseCase, type CreateTenantInput } from "@/modules/tenants/application/create-tenant";
import { normalizePublicTenantSlug, publicTenantSlug } from "@/modules/tenants/domain/public-tenant-slug";
import type { PlatformAccess, TenantAccess } from "@/server/auth/authorization";
import type { PermissionCode } from "@/server/auth/permissions";
import type { ExecutionContext } from "@/shared/application/execution-context";
import type { UnitOfWork } from "@/shared/application/ports";
import { NotFoundError } from "@/shared/domain/core";

export interface AuthorizationPort {
  requireTenantPermission(authSubject: string, tenantId: string, permission: PermissionCode): Promise<TenantAccess> | TenantAccess;
  requirePlatformPermission(authSubject: string, permission: PermissionCode): Promise<PlatformAccess> | PlatformAccess;
}

export interface BusinessApiUseCases {
  createTenant: CreateTenantUseCase;
  createProfessional: CreateProfessionalUseCase;
  createService: CreateServiceUseCase;
  createEquipment: CreateEquipmentUseCase;
  createPackage: CreatePackageUseCase;
  createCustomer: CreateCustomerUseCase;
  createAppointment: CreateAppointmentUseCase;
  createPublicAppointment: CreatePublicAppointmentUseCase;
  createPublicLead: CreatePublicLeadUseCase;
  updateLeadStatus: UpdateLeadStatusUseCase;
  confirmDeposit: ConfirmDepositUseCase;
  startSession: StartSessionUseCase;
  completeSession: CompleteSessionUseCase;
  registerPayment: RegisterPaymentUseCase;
  updateTenantBranding: UpdateTenantBrandingUseCase;
  updateTenantSettings: UpdateTenantSettingsUseCase;
  saveLandingPageDraft: SaveLandingPageDraftUseCase;
  publishLandingPage: PublishLandingPageUseCase;
  hideLandingPage: HideLandingPageUseCase;
}

export interface BusinessApiDependencies {
  authorization: AuthorizationPort;
  unitOfWork: UnitOfWork;
  leadRepository: LeadRepository;
  equipmentRepository: EquipmentRepository;
  packageRepository: PackageRepository;
  tenantSettingsRepository: TenantSettingsRepository;
  landingPageRepository: LandingPageRepository;
  useCases: BusinessApiUseCases;
}

function requireTenant(context: ExecutionContext): string {
  if (!context.tenantId) throw new Error(`Tenant is required for ${context.operation}.`);
  return context.tenantId;
}

export class BusinessApi {
  constructor(private readonly dependencies: BusinessApiDependencies) {}

  authorizeTenant(authSubject: string, tenantId: string, permission: PermissionCode) {
    return this.dependencies.authorization.requireTenantPermission(authSubject, tenantId, permission);
  }

  authorizePlatform(authSubject: string, permission: PermissionCode) {
    return this.dependencies.authorization.requirePlatformPermission(authSubject, permission);
  }

  private resolvePublicTenantId(context: ExecutionContext, slug: string): Promise<string> {
    const normalizedSlug = normalizePublicTenantSlug(slug);
    return this.dependencies.unitOfWork.execute(context, async (tx) => {
      const tenants = await tx.tenants.list();
      const tenant = tenants.find((candidate) =>
        (candidate.status === "active" || candidate.status === "trial") && publicTenantSlug(candidate) === normalizedSlug,
      );
      if (!tenant) throw new NotFoundError("public_tenant", normalizedSlug);
      return tenant.id;
    });
  }

  listCustomers(context: ExecutionContext) { const tenantId = requireTenant(context); return this.dependencies.unitOfWork.execute(context, (tx) => tx.customers.list(tenantId)); }
  listProfessionals(context: ExecutionContext) { const tenantId = requireTenant(context); return this.dependencies.unitOfWork.execute(context, (tx) => tx.professionals.list(tenantId)); }
  listServices(context: ExecutionContext) { const tenantId = requireTenant(context); return this.dependencies.unitOfWork.execute(context, (tx) => tx.services.list(tenantId)); }
  listEquipment(context: ExecutionContext) { return this.dependencies.equipmentRepository.list(requireTenant(context)); }
  listPackages(context: ExecutionContext) { return this.dependencies.packageRepository.list(requireTenant(context)); }
  listAppointments(context: ExecutionContext) { const tenantId = requireTenant(context); return this.dependencies.unitOfWork.execute(context, (tx) => tx.appointments.list(tenantId)); }
  listPayments(context: ExecutionContext) {
    const tenantId = requireTenant(context);
    return this.dependencies.unitOfWork.execute(context, async (tx) => {
      const customers = await tx.customers.list(tenantId);
      const groups = await Promise.all(customers.map((customer) => tx.payments.listByCustomer(tenantId, customer.id)));
      return groups.flat().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    });
  }
  listLeads(context: ExecutionContext) { return this.dependencies.leadRepository.list(requireTenant(context)); }
  getLeadActions(context: ExecutionContext, leadId: string) {
    const tenantId = requireTenant(context);
    return this.dependencies.leadRepository.findById(tenantId, leadId).then((lead) => {
      if (!lead) throw new NotFoundError("lead", leadId);
      return { leadId: lead.id, status: lead.status, allowedActions: allowedLeadActions(lead.status) };
    });
  }
  getTenantSettings(context: ExecutionContext) { return this.dependencies.tenantSettingsRepository.findByTenantId(requireTenant(context)); }
  async getLandingPage(context: ExecutionContext) {
    const tenantId = requireTenant(context);
    const page = await this.dependencies.landingPageRepository.findByTenantId(tenantId);
    if (!page) return null;
    const branding = await this.dependencies.unitOfWork.execute(context, (tx) => tx.tenantBranding.findByTenantId(tenantId));
    return { ...page, branding };
  }

  getPublicCatalog(context: ExecutionContext) {
    const tenantId = requireTenant(context);
    return this.dependencies.unitOfWork.execute(context, async (tx) => {
      const [tenant, branding, services, professionals] = await Promise.all([
        tx.tenants.findById(tenantId), tx.tenantBranding.findByTenantId(tenantId), tx.services.list(tenantId), tx.professionals.list(tenantId),
      ]);
      if (!tenant) throw new NotFoundError("tenant", tenantId);
      return { tenant: { id: tenant.id, displayName: tenant.displayName, timezone: tenant.timezone }, branding, services: services.filter((service) => service.active), professionals: professionals.filter((professional) => professional.active) };
    });
  }
  async getPublicCatalogBySlug(context: ExecutionContext, slug: string) { const tenantId = await this.resolvePublicTenantId(context, slug); return this.getPublicCatalog({ ...context, tenantId }); }
  getAppointmentActions(context: ExecutionContext, appointmentId: string) {
    const tenantId = requireTenant(context);
    return this.dependencies.unitOfWork.execute(context, async (tx) => {
      const appointment = await tx.appointments.findById(tenantId, appointmentId);
      if (!appointment) throw new NotFoundError("appointment", appointmentId);
      return { appointmentId: appointment.id, status: appointment.status, allowedActions: allowedAppointmentActions(appointment.status) };
    });
  }
  listAuditEvents(context: ExecutionContext) { const tenantId = requireTenant(context); return this.dependencies.unitOfWork.execute(context, (tx) => tx.audit.findMany({ tenantId })); }
  getTenantBranding(context: ExecutionContext) { const tenantId = requireTenant(context); return this.dependencies.unitOfWork.execute(context, (tx) => tx.tenantBranding.findByTenantId(tenantId)); }

  createTenant(context: ExecutionContext, input: CreateTenantInput) { return this.dependencies.useCases.createTenant.execute(context, input); }
  createProfessional(context: ExecutionContext, input: CreateProfessionalInput) { requireTenant(context); return this.dependencies.useCases.createProfessional.execute(context, input); }
  createService(context: ExecutionContext, input: CreateServiceInput) { requireTenant(context); return this.dependencies.useCases.createService.execute(context, input); }
  createEquipment(context: ExecutionContext, input: CreateEquipmentInput) { requireTenant(context); return this.dependencies.useCases.createEquipment.execute(context, input); }
  createPackage(context: ExecutionContext, input: CreatePackageInput) { requireTenant(context); return this.dependencies.useCases.createPackage.execute(context, input); }
  createCustomer(context: ExecutionContext, input: CreateCustomerInput) { requireTenant(context); return this.dependencies.useCases.createCustomer.execute(context, input); }
  createAppointment(context: ExecutionContext, input: CreateAppointmentInput) { requireTenant(context); return this.dependencies.useCases.createAppointment.execute(context, input); }
  createPublicAppointment(context: ExecutionContext, input: CreatePublicAppointmentInput) { requireTenant(context); return this.dependencies.useCases.createPublicAppointment.execute(context, input); }
  async createPublicAppointmentBySlug(context: ExecutionContext, slug: string, input: CreatePublicAppointmentInput) { const tenantId = await this.resolvePublicTenantId(context, slug); return this.dependencies.useCases.createPublicAppointment.execute({ ...context, tenantId }, input); }
  async createPublicLeadBySlug(context: ExecutionContext, slug: string, input: CreatePublicLeadInput) { const tenantId = await this.resolvePublicTenantId(context, slug); return this.dependencies.useCases.createPublicLead.execute({ tenantId }, input); }
  updateLeadStatus(context: ExecutionContext, input: UpdateLeadStatusInput) { requireTenant(context); return this.dependencies.useCases.updateLeadStatus.execute(context, input); }
  confirmDeposit(context: ExecutionContext, input: ConfirmDepositInput) { requireTenant(context); return this.dependencies.useCases.confirmDeposit.execute(context, input); }
  startSession(context: ExecutionContext, input: StartSessionInput) { requireTenant(context); return this.dependencies.useCases.startSession.execute(context, input); }
  completeSession(context: ExecutionContext, input: CompleteSessionInput) { requireTenant(context); return this.dependencies.useCases.completeSession.execute(context, input); }
  registerPayment(context: ExecutionContext, input: RegisterPaymentInput) { requireTenant(context); return this.dependencies.useCases.registerPayment.execute(context, input); }
  updateTenantBranding(context: ExecutionContext, input: UpdateTenantBrandingInput) { requireTenant(context); return this.dependencies.useCases.updateTenantBranding.execute(context, input); }
  updateTenantSettings(context: ExecutionContext, input: UpdateTenantSettingsInput) { requireTenant(context); return this.dependencies.useCases.updateTenantSettings.execute(context, input); }
  saveLandingPageDraft(context: ExecutionContext, input: SaveLandingPageDraftInput) { requireTenant(context); return this.dependencies.useCases.saveLandingPageDraft.execute(context, input); }
  publishLandingPage(context: ExecutionContext) { requireTenant(context); return this.dependencies.useCases.publishLandingPage.execute(context); }
  hideLandingPage(context: ExecutionContext) { requireTenant(context); return this.dependencies.useCases.hideLandingPage.execute(context); }
}
