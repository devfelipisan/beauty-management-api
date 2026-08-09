import { CreateAppointmentUseCase, type CreateAppointmentInput } from "@/modules/appointments/application/create-appointment";
import { CreatePublicAppointmentUseCase, type CreatePublicAppointmentInput } from "@/modules/appointments/application/create-public-appointment";
import { allowedAppointmentActions } from "@/modules/appointments/domain/appointment-state-machine";
import { CreateCustomerUseCase, type CreateCustomerInput } from "@/modules/customers/application/create-customer";
import { ConfirmDepositUseCase, type ConfirmDepositInput } from "@/modules/deposits/application/confirm-deposit";
import { CreatePublicLeadUseCase, type CreatePublicLeadInput } from "@/modules/leads/application/create-public-lead";
import { UpdateLeadStatusUseCase, type UpdateLeadStatusInput } from "@/modules/leads/application/update-lead-status";
import type { LeadRepository } from "@/modules/leads/domain/lead-repository";
import { allowedLeadActions } from "@/modules/leads/domain/lead-state-machine";
import { RegisterPaymentUseCase, type RegisterPaymentInput } from "@/modules/payments/application/register-payment";
import { CreateProfessionalUseCase, type CreateProfessionalInput } from "@/modules/professionals/application/create-professional";
import { CreateServiceUseCase, type CreateServiceInput } from "@/modules/services/application/create-service";
import { CompleteSessionUseCase, type CompleteSessionInput } from "@/modules/sessions/application/complete-session";
import { StartSessionUseCase, type StartSessionInput } from "@/modules/sessions/application/start-session";
import { UpdateTenantBrandingUseCase, type UpdateTenantBrandingInput } from "@/modules/tenant-branding/application/update-tenant-branding";
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
}

export interface BusinessApiDependencies {
  authorization: AuthorizationPort;
  unitOfWork: UnitOfWork;
  leadRepository: LeadRepository;
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

  listCustomers(context: ExecutionContext) {
    const tenantId = requireTenant(context);
    return this.dependencies.unitOfWork.execute(context, (tx) => tx.customers.list(tenantId));
  }

  listProfessionals(context: ExecutionContext) {
    const tenantId = requireTenant(context);
    return this.dependencies.unitOfWork.execute(context, (tx) => tx.professionals.list(tenantId));
  }

  listServices(context: ExecutionContext) {
    const tenantId = requireTenant(context);
    return this.dependencies.unitOfWork.execute(context, (tx) => tx.services.list(tenantId));
  }

  listAppointments(context: ExecutionContext) {
    const tenantId = requireTenant(context);
    return this.dependencies.unitOfWork.execute(context, (tx) => tx.appointments.list(tenantId));
  }

  listLeads(context: ExecutionContext) {
    const tenantId = requireTenant(context);
    return this.dependencies.leadRepository.list(tenantId);
  }

  getLeadActions(context: ExecutionContext, leadId: string) {
    const tenantId = requireTenant(context);
    return this.dependencies.leadRepository.findById(tenantId, leadId).then((lead) => {
      if (!lead) throw new NotFoundError("lead", leadId);
      return { leadId: lead.id, status: lead.status, allowedActions: allowedLeadActions(lead.status) };
    });
  }

  getPublicCatalog(context: ExecutionContext) {
    const tenantId = requireTenant(context);
    return this.dependencies.unitOfWork.execute(context, async (tx) => {
      const [tenant, branding, services, professionals] = await Promise.all([
        tx.tenants.findById(tenantId),
        tx.tenantBranding.findByTenantId(tenantId),
        tx.services.list(tenantId),
        tx.professionals.list(tenantId),
      ]);
      if (!tenant) throw new NotFoundError("tenant", tenantId);
      return {
        tenant: { id: tenant.id, displayName: tenant.displayName, timezone: tenant.timezone },
        branding,
        services: services.filter((service) => service.active),
        professionals: professionals.filter((professional) => professional.active),
      };
    });
  }

  async getPublicCatalogBySlug(context: ExecutionContext, slug: string) {
    const tenantId = await this.resolvePublicTenantId(context, slug);
    return this.getPublicCatalog({ ...context, tenantId });
  }

  getAppointmentActions(context: ExecutionContext, appointmentId: string) {
    const tenantId = requireTenant(context);
    return this.dependencies.unitOfWork.execute(context, async (tx) => {
      const appointment = await tx.appointments.findById(tenantId, appointmentId);
      if (!appointment) throw new NotFoundError("appointment", appointmentId);
      return { appointmentId: appointment.id, status: appointment.status, allowedActions: allowedAppointmentActions(appointment.status) };
    });
  }

  listAuditEvents(context: ExecutionContext) {
    const tenantId = requireTenant(context);
    return this.dependencies.unitOfWork.execute(context, (tx) => tx.audit.findMany({ tenantId }));
  }

  getTenantBranding(context: ExecutionContext) {
    const tenantId = requireTenant(context);
    return this.dependencies.unitOfWork.execute(context, (tx) => tx.tenantBranding.findByTenantId(tenantId));
  }

  createTenant(context: ExecutionContext, input: CreateTenantInput) { return this.dependencies.useCases.createTenant.execute(context, input); }
  createProfessional(context: ExecutionContext, input: CreateProfessionalInput) { requireTenant(context); return this.dependencies.useCases.createProfessional.execute(context, input); }
  createService(context: ExecutionContext, input: CreateServiceInput) { requireTenant(context); return this.dependencies.useCases.createService.execute(context, input); }
  createCustomer(context: ExecutionContext, input: CreateCustomerInput) { requireTenant(context); return this.dependencies.useCases.createCustomer.execute(context, input); }
  createAppointment(context: ExecutionContext, input: CreateAppointmentInput) { requireTenant(context); return this.dependencies.useCases.createAppointment.execute(context, input); }
  createPublicAppointment(context: ExecutionContext, input: CreatePublicAppointmentInput) { requireTenant(context); return this.dependencies.useCases.createPublicAppointment.execute(context, input); }
  async createPublicAppointmentBySlug(context: ExecutionContext, slug: string, input: CreatePublicAppointmentInput) {
    const tenantId = await this.resolvePublicTenantId(context, slug);
    return this.dependencies.useCases.createPublicAppointment.execute({ ...context, tenantId }, input);
  }
  async createPublicLeadBySlug(context: ExecutionContext, slug: string, input: CreatePublicLeadInput) {
    const tenantId = await this.resolvePublicTenantId(context, slug);
    return this.dependencies.useCases.createPublicLead.execute({ tenantId }, input);
  }
  updateLeadStatus(context: ExecutionContext, input: UpdateLeadStatusInput) { requireTenant(context); return this.dependencies.useCases.updateLeadStatus.execute(context, input); }
  confirmDeposit(context: ExecutionContext, input: ConfirmDepositInput) { requireTenant(context); return this.dependencies.useCases.confirmDeposit.execute(context, input); }
  startSession(context: ExecutionContext, input: StartSessionInput) { requireTenant(context); return this.dependencies.useCases.startSession.execute(context, input); }
  completeSession(context: ExecutionContext, input: CompleteSessionInput) { requireTenant(context); return this.dependencies.useCases.completeSession.execute(context, input); }
  registerPayment(context: ExecutionContext, input: RegisterPaymentInput) { requireTenant(context); return this.dependencies.useCases.registerPayment.execute(context, input); }
  updateTenantBranding(context: ExecutionContext, input: UpdateTenantBrandingInput) { requireTenant(context); return this.dependencies.useCases.updateTenantBranding.execute(context, input); }
}
