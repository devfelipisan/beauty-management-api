import type { PermissionCode } from "@/server/auth/permissions";
import { getAuthVerifier, getAuthorizationService, getBusinessApi } from "@/config/dependencies";
import { readBearerToken } from "@/server/auth/authentication";
import type { TenantAccess } from "@/server/auth/authorization";
import { createExecutionContext } from "@/shared/application/execution-context";

export function readTenantSelection(request: Request): string | undefined {
  const tenantId = request.headers.get("x-tenant-id")?.trim();
  return tenantId || undefined;
}

export function createApiExecutionContext(
  request: Request,
  operation: string,
  access?: Pick<TenantAccess, "tenantId" | "actorId" | "membershipId" | "professionalId">,
) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
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
  const token = readBearerToken(request);
  return getAuthVerifier().verify(token);
}

export async function resolveAuthenticatedTenant(request: Request) {
  const identity = await authenticateRequest(request);
  const selection = readTenantSelection(request);
  const access = await getAuthorizationService().resolveTenantContext(identity.subject, selection);
  return { identity, access };
}

export async function authorizeTenantRequest(request: Request, permission: PermissionCode) {
  const identity = await authenticateRequest(request);
  const selection = readTenantSelection(request);
  const access = await getAuthorizationService().requireResolvedTenantPermission(identity.subject, selection, permission);
  return { api: getBusinessApi(), access, tenantId: access.tenantId, actorId: access.actorId, identity };
}

export async function authorizePlatformRequest(request: Request, permission: PermissionCode) {
  const identity = await authenticateRequest(request);
  const access = await getAuthorizationService().requirePlatformPermission(identity.subject, permission);
  return { api: getBusinessApi(), actorId: access.actorId, identity };
}
