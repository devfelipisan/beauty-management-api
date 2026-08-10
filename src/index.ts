import { Hono } from "hono";
import { registerBusinessRoutes } from "@/api/http-routes";
import { registerEquipmentRoutes } from "@/api/equipment-routes";
import { registerPackageRoutes } from "@/api/package-routes";
import { registerTenantExperienceRoutes } from "@/api/tenant-experience-routes";

const app = new Hono();

const healthPayload = {
  service: "beauty-management-api",
  status: "ok",
  businessApiMigration: "domain-and-transactional-rules",
  apiBasePath: "/v1",
};

app.get("/health", (context) => context.json(healthPayload));
app.get("/v1/health", (context) => context.json(healthPayload));
registerBusinessRoutes(app);
registerEquipmentRoutes(app);
registerPackageRoutes(app);
registerTenantExperienceRoutes(app);

export default app;
