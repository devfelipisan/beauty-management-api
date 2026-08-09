import { ConfirmDepositUseCase, type ConfirmDepositInput } from "@/modules/deposits/application/confirm-deposit";
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
  createTenant(context: ExecutionContext, input: unknown): Promise<unknown>;
  createProfessional(context: ExecutionContext, input: unknown): Promise<unknown>;
  createService(context: ExecutionContext, input: unknown): Promise<unknown>;
  createCustomer(context: ExecutionContext, input: unknown): Promise<unknown>;
  createAppointment(context: ExecutionContext, input: unknown): Promise<unknown>;
  createPublicAppointment(context: ExecutionContext, input: unknown): Promise<unknown>;
  createPublicAppointmentBySlug(context: ExecutionContext, slug: string, input: unknown): Promise<unknown>;
  createPublicLeadBySlug(context: ExecutionContext, slug: string, input: unknown): Promise<unknown>;
  updateLeadStatus(context: ExecutionContext, input: unknown): Promise<unknown>;
  startSession(context: ExecutionContext, input: unknown): Promise<unknown>;
  completeSession(context: ExecutionContext, input: unknown): Promise<unknown>;
  registerPayment(context: ExecutionContext, input: unknown): Promise<unknown>;
  updateTenantBranding(context: ExecutionContext, input: unknown): Promise<unknown>;
}

export interface BusinessApiUseCases {
  confirmDeposit: ConfirmDepositUseCase;
}

export interface BusinessApiDependencies {
  authorization: AuthorizationPort;
  queries: BusinessApiQueries;
  commands: BusinessApiCommands;
  useCases: BusinessApiUseCases;
}

function requireTenant(context: ExecutionContext): string {
  if (!context.tenantId) {
    throw new Error(`Tenant is required for ${context.operation}.`);
  }
  return context.tenantId;
}

/**
 * Authoritative backend facade migrated from beauty-management-web.
 *
 * HTTP/Cloudflare details stay outside this facade. Migrated application use
 * cases replace the temporary command bridge one operation at a time.
 */
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

  createTenant(context: ExecutionContext, input: unknown) { return this.dependencies.commands.createTenant(context, input); }
  createProfessional(context: ExecutionContext, input: unknown) { requireTenant(context); return this.dependencies.commands.createProfessional(context, input); }
  createService(context: ExecutionContext, input: unknown) { requireTenant(context); return this.dependencies.commands.createService(context, input); }
  createCustomer(context: ExecutionContext, input: unknown) { requireTenant(context); return this.dependencies.commands.createCustomer(context, input); }
  createAppointment(context: ExecutionContext, input: unknown) { requireTenant(context); return this.dependencies.commands.createAppointment(context, input); }
  createPublicAppointment(context: ExecutionContext, input: unknown) { requireTenant(context); return this.dependencies.commands.createPublicAppointment(context, input); }
  createPublicAppointmentBySlug(context: ExecutionContext, slug: string, input: unknown) { return this.dependencies.commands.createPublicAppointmentBySlug(context, slug, input); }
  createPublicLeadBySlug(context: ExecutionContext, slug: string, input: unknown) { return this.dependencies.commands.createPublicLeadBySlug(context, slug, input); }
  updateLeadStatus(context: ExecutionContext, input: unknown) { requireTenant(context); return this.dependencies.commands.updateLeadStatus(context, input); }
  confirmDeposit(context: ExecutionContext, input: ConfirmDepositInput) { requireTenant(context); return this.dependencies.useCases.confirmDeposit.execute(context, input); }
  startSession(context: ExecutionContext, input: unknown) { requireTenant(context); return this.dependencies.commands.startSession(context, input); }
  completeSession(context: ExecutionContext, input: unknown) { requireTenant(context); return this.dependencies.commands.completeSession(context, input); }
  registerPayment(context: ExecutionContext, input: unknown) { requireTenant(context); return this.dependencies.commands.registerPayment(context, input); }
  updateTenantBranding(context: ExecutionContext, input: unknown) { requireTenant(context); return this.dependencies.commands.updateTenantBranding(context, input); }
}
