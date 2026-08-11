import type { PermissionCode } from "@/server/auth/permissions";
import { getAuthVerifier, getAuthorizationService, getBusinessApi } from "@/config/dependencies";
import { readBearerToken } from "@/server/auth/authentication";
import type { TenantAccess } from "@/server/auth/authorization";
import { createExecutionContext } from "@/shared/application/execution-context";

const resolvedAccessByRequest = new WeakMap<Request, TenantAccess>();

export function readTenantSelection(request: Request): string | undefined {
  const tenantId = request.headers.get("x-tenant-id")?.trim();
  return tenantId || undefined;
}

export function createApiExecutionContext(
  request: Request,
  operation: string,
  accessOrTenantId?: Pick<TenantAccess, "tenantId" | "actorId" | "membershipId" | "professionalId"> | string,
  actorId?: string,
) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const resolved = resolvedAccessByRequest.get(request);
  const access = typeof accessOrTenantId === "string"
    ? (resolved?.tenantId === accessOrTenantId
      ? resolved
      : { tenantId: accessOrTenantId, actorId })
    : (accessOrTenantId ?? resolved);
  return createExecutionContext(operation, {
    requestId,
    correlationId: request.headers.get("x-correlation-id") ?? requestId,
    tenantId: access?.tenantId,
    actorId: access?.actorId,
    membershipId: access && "membershipId" in access ? access.membershipId : undefined,
    professionalId: access && "professionalId" in access ? access.professionalId : undefined,
    source: "api",
  });
}

export async function authenticateRequest(request: Request) {
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

export async function authorizeTenantRequest(request: Request, permission: PermissionCode) {
  const identity = await authenticateRequest(request);
  const selection = readTenantSelection(request);
  const access = await getAuthorizationService().requireResolvedTenantPermission(identity.subject, selection, permission);
  resolvedAccessByRequest.set(request, access);
  return { api: getBusinessApi(), access, tenantId: access.tenantId, actorId: access.actorId, identity };
}

export async function authorizePlatformRequest(request: Request, permission: PermissionCode) {
  const identity = await authenticateRequest(request);
  const access = await getAuthorizationService().requirePlatformPermission(identity.subject, permission);
  return { api: getBusinessApi(), actorId: access.actorId, identity };
}
