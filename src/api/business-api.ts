import { CreateAppointmentUseCase, type CreateAppointmentInput } from "@/modules/appointments/application/create-appointment";
import { CreateCustomerUseCase, type CreateCustomerInput } from "@/modules/customers/application/create-customer";
import { ConfirmDepositUseCase, type ConfirmDepositInput } from "@/modules/deposits/application/confirm-deposit";
import { RegisterPaymentUseCase, type RegisterPaymentInput } from "@/modules/payments/application/register-payment";
import { CreateProfessionalUseCase, type CreateProfessionalInput } from "@/modules/professionals/application/create-professional";
import { CreateServiceUseCase, type CreateServiceInput } from "@/modules/services/application/create-service";
import { CompleteSessionUseCase, type CompleteSessionInput } from "@/modules/sessions/application/complete-session";
import { StartSessionUseCase, type StartSessionInput } from "@/modules/sessions/application/start-session";
import { CreateTenantUseCase, type CreateTenantInput } from "@/modules/tenants/application/create-tenant";
import type { PermissionCode } from "@/server/auth/permissions";
import type { ExecutionContext } from "@/shared/application/execution-context";

export interface AuthorizationPort {
  requireTenantPermission(authSubject: string, tenantId: string, permission: PermissionCode): Promise<void> | void;
  requirePlatformPermission(authSubject: string, permission: PermissionCode): Promise<void> | void;
}

export interface BusinessApiQueries {
  listCustomers(context: ExecutionContext): Promise<unknown>;
  listProfessionals(context: ExecutionContext): Promise<unknown>;
  listServices(context: ExecutionContext): Promise<unknown>;
  listAppointments(context: ExecutionContext): Promise<unknown>;
  listLeads(context: ExecutionContext): Promise<unknown>;
  getLeadActions(context: ExecutionContext, leadId: string): Promise<unknown>;
  getPublicCatalog(context: ExecutionContext): Promise<unknown>;
  getPublicCatalogBySlug(context: ExecutionContext, slug: string): Promise<unknown>;
  getAppointmentActions(context: ExecutionContext, appointmentId: string): Promise<unknown>;
  listAuditEvents(context: ExecutionContext): Promise<unknown>;
  getTenantBranding(context: ExecutionContext): Promise<unknown>;
}

export interface BusinessApiCommands {
  createPublicAppointment(context: ExecutionContext, input: unknown): Promise<unknown>;
  createPublicAppointmentBySlug(context: ExecutionContext, slug: string, input: unknown): Promise<unknown>;
  createPublicLeadBySlug(context: ExecutionContext, slug: string, input: unknown): Promise<unknown>;
  updateLeadStatus(context: ExecutionContext, input: unknown): Promise<unknown>;
  updateTenantBranding(context: ExecutionContext, input: unknown): Promise<unknown>;
}

export interface BusinessApiUseCases {
  createTenant: CreateTenantUseCase;
  createProfessional: CreateProfessionalUseCase;
  createService: CreateServiceUseCase;
  createCustomer: CreateCustomerUseCase;
  createAppointment: CreateAppointmentUseCase;
  confirmDeposit: ConfirmDepositUseCase;
  startSession: StartSessionUseCase;
  completeSession: CompleteSessionUseCase;
  registerPayment: RegisterPaymentUseCase;
}

export interface BusinessApiDependencies {
  authorization: AuthorizationPort;
  queries: BusinessApiQueries;
  commands: BusinessApiCommands;
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

  listCustomers(context: ExecutionContext) { requireTenant(context); return this.dependencies.queries.listCustomers(context); }
  listProfessionals(context: ExecutionContext) { requireTenant(context); return this.dependencies.queries.listProfessionals(context); }
  listServices(context: ExecutionContext) { requireTenant(context); return this.dependencies.queries.listServices(context); }
  listAppointments(context: ExecutionContext) { requireTenant(context); return this.dependencies.queries.listAppointments(context); }
  listLeads(context: ExecutionContext) { requireTenant(context); return this.dependencies.queries.listLeads(context); }
  getLeadActions(context: ExecutionContext, leadId: string) { requireTenant(context); return this.dependencies.queries.getLeadActions(context, leadId); }
  getPublicCatalog(context: ExecutionContext) { requireTenant(context); return this.dependencies.queries.getPublicCatalog(context); }
  getPublicCatalogBySlug(context: ExecutionContext, slug: string) { return this.dependencies.queries.getPublicCatalogBySlug(context, slug); }
  getAppointmentActions(context: ExecutionContext, appointmentId: string) { requireTenant(context); return this.dependencies.queries.getAppointmentActions(context, appointmentId); }
  listAuditEvents(context: ExecutionContext) { requireTenant(context); return this.dependencies.queries.listAuditEvents(context); }
  getTenantBranding(context: ExecutionContext) { requireTenant(context); return this.dependencies.queries.getTenantBranding(context); }

  createTenant(context: ExecutionContext, input: CreateTenantInput) { return this.dependencies.useCases.createTenant.execute(context, input); }
  createProfessional(context: ExecutionContext, input: CreateProfessionalInput) { requireTenant(context); return this.dependencies.useCases.createProfessional.execute(context, input); }
  createService(context: ExecutionContext, input: CreateServiceInput) { requireTenant(context); return this.dependencies.useCases.createService.execute(context, input); }
  createCustomer(context: ExecutionContext, input: CreateCustomerInput) { requireTenant(context); return this.dependencies.useCases.createCustomer.execute(context, input); }
  createAppointment(context: ExecutionContext, input: CreateAppointmentInput) { requireTenant(context); return this.dependencies.useCases.createAppointment.execute(context, input); }
  createPublicAppointment(context: ExecutionContext, input: unknown) { requireTenant(context); return this.dependencies.commands.createPublicAppointment(context, input); }
  createPublicAppointmentBySlug(context: ExecutionContext, slug: string, input: unknown) { return this.dependencies.commands.createPublicAppointmentBySlug(context, slug, input); }
  createPublicLeadBySlug(context: ExecutionContext, slug: string, input: unknown) { return this.dependencies.commands.createPublicLeadBySlug(context, slug, input); }
  updateLeadStatus(context: ExecutionContext, input: unknown) { requireTenant(context); return this.dependencies.commands.updateLeadStatus(context, input); }
  confirmDeposit(context: ExecutionContext, input: ConfirmDepositInput) { requireTenant(context); return this.dependencies.useCases.confirmDeposit.execute(context, input); }
  startSession(context: ExecutionContext, input: StartSessionInput) { requireTenant(context); return this.dependencies.useCases.startSession.execute(context, input); }
  completeSession(context: ExecutionContext, input: CompleteSessionInput) { requireTenant(context); return this.dependencies.useCases.completeSession.execute(context, input); }
  registerPayment(context: ExecutionContext, input: RegisterPaymentInput) { requireTenant(context); return this.dependencies.useCases.registerPayment.execute(context, input); }
  updateTenantBranding(context: ExecutionContext, input: unknown) { requireTenant(context); return this.dependencies.commands.updateTenantBranding(context, input); }
}
