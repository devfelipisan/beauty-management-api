import type { Hono } from "hono";
import { parseBusinessCommandInput } from "@/api/contracts";
import { authorizeTenantRequest, createApiExecutionContext } from "@/api/request-security";
import { Permissions } from "@/server/auth/permissions";

export function registerEquipmentRoutes(app: Hono) {
  app.get("/v1/equipment", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.EquipmentRead);
    return c.json(await api.listEquipment(createApiExecutionContext(c.req.raw, "equipment.list", tenantId, actorId)));
  });

  app.post("/v1/equipment", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.EquipmentCreate);
    const raw = await c.req.raw.json().catch(() => ({}));
    const input = parseBusinessCommandInput("equipment.create", raw);
    return c.json(await api.createEquipment(createApiExecutionContext(c.req.raw, "equipment.create", tenantId, actorId), input as never), 201);
  });
}
