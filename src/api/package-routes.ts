import type { Hono } from "hono";
import { parseBusinessCommandInput } from "@/api/contracts";
import { authorizeTenantRequest, createApiExecutionContext } from "@/api/request-security";
import { Permissions } from "@/server/auth/permissions";

export function registerPackageRoutes(app: Hono) {
  app.get("/v1/packages", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.PackageRead);
    return c.json(await api.listPackages(createApiExecutionContext(c.req.raw, "package.list", tenantId, actorId)));
  });

  app.post("/v1/packages", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.PackageCreate);
    const raw = await c.req.raw.json().catch(() => ({}));
    const input = parseBusinessCommandInput("package.create", raw);
    return c.json(await api.createPackage(createApiExecutionContext(c.req.raw, "package.create", tenantId, actorId), input as never), 201);
  });
}
