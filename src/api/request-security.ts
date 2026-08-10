import type { PermissionCode } from "@/server/auth/permissions";
import { getAuthVerifier, getBusinessApi } from "@/config/dependencies";
import { readBearerToken, resolveApiAuthMode } from "@/server/auth/authentication";
import { createExecutionContext } from "@/shared/application/execution-context";
import { DomainError } from "@/shared/domain/core";

function currentAuthMode() {
  return resolveApiAuthMode(process.env.API_AUTH_MODE);
}

export function readTenantSelection(request: Request): string {
  const tenantId = request.headers.get("x-tenant-id")?.trim();
  if (tenantId) return tenantId;

  // Authentication is temporarily disabled for implementation/integration
  // testing. In this mode the backend provides a deterministic tenant context
  // when the BFF does not explicitly select one.
  if (currentAuthMode() === "disabled") {
    return process.env.API_DEV_TENANT_ID?.trim() || "tenant-bella";
  }

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
  if (currentAuthMode() === "disabled") {
    return getAuthVerifier().verify("");
  }
  const token = readBearerToken(request);
  return getAuthVerifier().verify(token);
}

export async function authorizeTenantRequest(request: Request, permission: PermissionCode) {
  const api = getBusinessApi();
  const identity = await authenticateRequest(request);
  const tenantId = readTenantSelection(request);

  // x-tenant-id is only a selection hint. Membership and permission are always
  // resolved authoritatively by the backend before a tenant context is created.
  const access = await api.authorizeTenant(identity.subject, tenantId, permission);
  return { api, tenantId, actorId: access.actorId, identity };
}

export async function authorizePlatformRequest(request: Request, permission: PermissionCode) {
  const api = getBusinessApi();
  const identity = await authenticateRequest(request);
  const access = await api.authorizePlatform(identity.subject, permission);
  return { api, actorId: access.actorId, identity };
}
