import type { PermissionCode } from "@/server/auth/permissions";
import { getAuthVerifier, getBusinessApi } from "@/config/dependencies";
import { readBearerToken } from "@/server/auth/authentication";
import { createExecutionContext } from "@/shared/application/execution-context";
import { DomainError } from "@/shared/domain/core";

export function readTenantSelection(request: Request): string {
  const tenantId = request.headers.get("x-tenant-id")?.trim();
  if (tenantId) return tenantId;
  throw new DomainError(
    "TENANT_CONTEXT_REQUIRED",
    "A tenant selection is required for tenant-scoped operations.",
  );
}

export function createApiExecutionContext(
  request: Request,
  operation: string,
  tenantId?: string,
  actorId?: string,
) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  return createExecutionContext(operation, {
    requestId,
    correlationId: request.headers.get("x-correlation-id") ?? requestId,
    tenantId,
    actorId,
    source: "api",
  });
}

export async function authenticateRequest(request: Request) {
  return getAuthVerifier().verify(readBearerToken(request));
}

export async function authorizeTenantRequest(request: Request, permission: PermissionCode) {
  const api = getBusinessApi();
  const identity = await authenticateRequest(request);
  const tenantId = readTenantSelection(request);
  const access = await api.authorizeTenant(identity.subject, tenantId, permission);
  return { api, tenantId, actorId: access.actorId, identity };
}

export async function authorizePlatformRequest(request: Request, permission: PermissionCode) {
  const api = getBusinessApi();
  const identity = await authenticateRequest(request);
  const access = await api.authorizePlatform(identity.subject, permission);
  return { api, actorId: access.actorId, identity };
}
