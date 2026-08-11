import type { PermissionCode } from "@/server/auth/permissions";
import { getAuthVerifier, getAuthorizationService, getBusinessApi, getOperationalTenantResolver } from "@/config/dependencies";
import { readAuthenticationPolicy } from "@/config/authentication-policy";
import { readBearerToken } from "@/server/auth/authentication";
import type { TenantAccess } from "@/server/auth/authorization";
import { createExecutionContext } from "@/shared/application/execution-context";
import { DomainError } from "@/shared/domain/core";

export interface TenantRequestContext {
  tenantId: string;
  actorId?: string;
  membershipId?: string;
  professionalId?: string;
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
  const tenantId = request.headers.get("x-tenant-id")?.trim();
  return tenantId || undefined;
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

async function resolveUnauthenticatedTenant(request: Request): Promise<TenantRequestContext> {
  const tenant = await getOperationalTenantResolver().execute(readTenantSelection(request));
  const access: TenantRequestContext = { tenantId: tenant.tenantId };
  resolvedAccessByRequest.set(request, access);
  return access;
}

export async function authorizeTenantRequest(request: Request, permission: PermissionCode) {
  if (!isAuthenticationEnabled()) {
    const access = await resolveUnauthenticatedTenant(request);
    return {
      api: getBusinessApi(),
      access,
      tenantId: access.tenantId,
      actorId: undefined,
      identity: undefined,
      permissionEnforced: false as const,
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
