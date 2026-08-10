import type { Hono } from "hono";
import { parseBusinessCommandInput } from "@/api/contracts";
import { getBusinessApi } from "@/config/dependencies";
import { Permissions } from "@/server/auth/permissions";
import { createExecutionContext } from "@/shared/application/execution-context";
import { DomainError } from "@/shared/domain/core";

function authSubject(request: Request): string {
  const header = request.headers.get("authorization")?.trim();
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return "user-tenant-admin";
}

function tenantId(request: Request): string {
  const value = request.headers.get("x-tenant-id")?.trim();
  if (!value) throw new DomainError("TENANT_HEADER_REQUIRED", "x-tenant-id is required for tenant operations.");
  return value;
}

function contextFor(request: Request, operation: string, tenant: string, actorId: string) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  return createExecutionContext(operation, {
    requestId,
    correlationId: request.headers.get("x-correlation-id") ?? requestId,
    tenantId: tenant,
    actorId,
    source: "api",
  });
}

export function registerPackageRoutes(app: Hono) {
  app.get("/v1/packages", async (c) => {
    const api = getBusinessApi();
    const tenant = tenantId(c.req.raw);
    const access = await api.authorizeTenant(authSubject(c.req.raw), tenant, Permissions.PackageRead);
    return c.json(await api.listPackages(contextFor(c.req.raw, "package.list", tenant, access.actorId)));
  });

  app.post("/v1/packages", async (c) => {
    const api = getBusinessApi();
    const tenant = tenantId(c.req.raw);
    const access = await api.authorizeTenant(authSubject(c.req.raw), tenant, Permissions.PackageCreate);
    const raw = await c.req.raw.json().catch(() => ({}));
    const input = parseBusinessCommandInput("package.create", raw);
    return c.json(await api.createPackage(contextFor(c.req.raw, "package.create", tenant, access.actorId), input as never), 201);
  });
}
