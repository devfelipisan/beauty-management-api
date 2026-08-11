import { createEntityId } from "@/shared/domain/core";

export type ExecutionSource = "web" | "api" | "worker" | "job" | "test";
export type WorkspaceRole = "administrator" | "reception" | "professional";

export interface ExecutionContext {
  requestId: string;
  correlationId: string;
  tenantId?: string;
  actorId?: string;
  membershipId?: string;
  professionalId?: string;
  workspaceRole?: WorkspaceRole;
  source: ExecutionSource;
  operation: string;
}

export interface TenantContext {
  tenantId: string;
  actorId?: string;
  membershipId?: string;
  professionalId?: string;
  workspaceRole?: WorkspaceRole;
}

export function createExecutionContext(
  operation: string,
  overrides: Partial<Omit<ExecutionContext, "operation">> = {},
): ExecutionContext {
  const requestId = overrides.requestId ?? createEntityId();
  return {
    requestId,
    correlationId: overrides.correlationId ?? requestId,
    tenantId: overrides.tenantId,
    actorId: overrides.actorId,
    membershipId: overrides.membershipId,
    professionalId: overrides.professionalId,
    workspaceRole: overrides.workspaceRole,
    source: overrides.source ?? "web",
    operation,
  };
}

export function requireTenant(context: ExecutionContext): TenantContext {
  if (!context.tenantId) {
    throw new Error(`Tenant is required for operation ${context.operation}.`);
  }
  return {
    tenantId: context.tenantId,
    actorId: context.actorId,
    membershipId: context.membershipId,
    professionalId: context.professionalId,
    workspaceRole: context.workspaceRole,
  };
}
