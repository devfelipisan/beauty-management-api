import type { PermissionCode } from "@/server/auth/permissions";
import { DEFAULT_ROLE_PERMISSIONS, Permissions, SystemRoleCodes } from "@/server/auth/permissions";
import { getAuthVerifier, getAuthorizationService, getBusinessApi } from "@/config/dependencies";
import { readAuthenticationPolicy } from "@/config/authentication-policy";
import { getWorkspaceContextResolver } from "@/config/workspace-context";
import { readBearerToken } from "@/server/auth/authentication";
import type { TenantAccess } from "@/server/auth/authorization";
import { createExecutionContext, type WorkspaceRole } from "@/shared/application/execution-context";
import { DomainError } from "@/shared/domain/core";

export interface TenantRequestContext {
  tenantId: string;
  actorId?: string;
  membershipId?: string;
  professionalId?: string;
  workspaceRole?: WorkspaceRole;
}

const resolvedAccessByRequest = new WeakMap<Request, TenantRequestContext>();

export function isAuthenticationEnabled(): boolean {
  return readAuthenticationPolicy().enabled;
}

export function requireAuthenticationEnabled(): void {
  if (!isAuthenticationEnabled()) {
    throw new DomainError(
      "AUTHENTICATION_NOT_ENABLED",
      "This operation requires user authentication, which is not enabled yet.",
    );
  }
}

export function readTenantSelection(request: Request): string | undefined {
  return request.headers.get("x-tenant-id")?.trim() || undefined;
}

export function readWorkspaceRoleSelection(request: Request): string | undefined {
  return request.headers.get("x-workspace-role")?.trim() || undefined;
}

export function readProfessionalSelection(request: Request): string | undefined {
  return request.headers.get("x-professional-id")?.trim() || undefined;
}

export function createApiExecutionContext(
  request: Request,
  operation: string,
  accessOrTenantId?: TenantRequestContext | string,
  actorId?: string,
) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const resolved = resolvedAccessByRequest.get(request);
  const access = typeof accessOrTenantId === "string"
    ? (resolved?.tenantId === accessOrTenantId ? resolved : { tenantId: accessOrTenantId, actorId })
    : (accessOrTenantId ?? resolved);
  return createExecutionContext(operation, {
    requestId,
    correlationId: request.headers.get("x-correlation-id") ?? requestId,
    tenantId: access?.tenantId,
    actorId: access?.actorId,
    membershipId: access?.membershipId,
    professionalId: access?.professionalId,
    workspaceRole: access?.workspaceRole,
    source: "api",
  });
}

export async function authenticateRequest(request: Request) {
  requireAuthenticationEnabled();
  const token = readBearerToken(request);
  return getAuthVerifier().verify(token);
}

export async function resolveAuthenticatedTenant(request: Request) {
  const identity = await authenticateRequest(request);
  const selection = readTenantSelection(request);
  const access = await getAuthorizationService().resolveTenantContext(identity.subject, selection);
  resolvedAccessByRequest.set(request, access);
  return { identity, access };
}

function systemRoleForWorkspace(role: WorkspaceRole) {
  if (role === "administrator") return SystemRoleCodes.TenantAdmin;
  if (role === "reception") return SystemRoleCodes.Reception;
  return SystemRoleCodes.Professional;
}

function permissionForWorkspace(role: WorkspaceRole, requested: PermissionCode): PermissionCode {
  if (role === "professional" && requested === Permissions.AppointmentRead) return Permissions.AppointmentReadOwn;
  if (role === "professional" && requested === Permissions.CustomerRead) return Permissions.CustomerReadLinked;
  return requested;
}

async function resolveUnauthenticatedWorkspace(request: Request, permission: PermissionCode): Promise<TenantRequestContext> {
  const resolved = await getWorkspaceContextResolver().resolve({
    tenantId: readTenantSelection(request),
    role: readWorkspaceRoleSelection(request),
    professionalId: readProfessionalSelection(request),
  });

  const effectivePermission = permissionForWorkspace(resolved.role, permission);
  const systemRole = systemRoleForWorkspace(resolved.role);
  if (!DEFAULT_ROLE_PERMISSIONS[systemRole].includes(effectivePermission)) {
    throw new DomainError(
      "WORKSPACE_ROLE_FORBIDDEN",
      `The ${resolved.role} workspace cannot execute ${permission}.`,
      { role: resolved.role, permission },
    );
  }

  const access: TenantRequestContext = {
    tenantId: resolved.tenantId,
    professionalId: resolved.professionalId,
    workspaceRole: resolved.role,
  };
  resolvedAccessByRequest.set(request, access);
  return access;
}

export async function authorizeTenantRequest(request: Request, permission: PermissionCode) {
  if (!isAuthenticationEnabled()) {
    const access = await resolveUnauthenticatedWorkspace(request, permission);
    return {
      api: getBusinessApi(),
      access,
      tenantId: access.tenantId,
      actorId: undefined,
      identity: undefined,
      permissionEnforced: true as const,
    };
  }

  const identity = await authenticateRequest(request);
  const selection = readTenantSelection(request);
  const access: TenantAccess = await getAuthorizationService().requireResolvedTenantPermission(identity.subject, selection, permission);
  resolvedAccessByRequest.set(request, access);
  return {
    api: getBusinessApi(),
    access,
    tenantId: access.tenantId,
    actorId: access.actorId,
    identity,
    permissionEnforced: true as const,
  };
}

export async function authorizePlatformRequest(request: Request, permission: PermissionCode) {
  requireAuthenticationEnabled();
  const identity = await authenticateRequest(request);
  const access = await getAuthorizationService().requirePlatformPermission(identity.subject, permission);
  return { api: getBusinessApi(), actorId: access.actorId, identity };
}
