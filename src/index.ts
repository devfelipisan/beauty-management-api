import { Hono } from "hono";
import { registerAdministrationRoutes } from "@/api/administration-routes";
import { registerBusinessRoutes } from "@/api/http-routes";
import { registerEquipmentRoutes } from "@/api/equipment-routes";
import { registerExtractedContextRoutes } from "@/api/extracted-context-routes";
import { registerPackageRoutes } from "@/api/package-routes";
import { registerTenantContextRoutes } from "@/api/tenant-context-routes";
import { registerTenantExperienceRoutes } from "@/api/tenant-experience-routes";
import { getSqlClient } from "@/config/dependencies";

const app = new Hono();

const healthPayload = {
  service: "beauty-management-api",
  status: "ok",
  businessApiMigration: "domain-and-transactional-rules",
  persistence: "postgresql",
  tenancy: "database-resolved",
  apiBasePath: "/v1",
};

app.get("/health", (context) => context.json(healthPayload));
app.get("/v1/health", (context) => context.json(healthPayload));
app.get("/health/ready", async (context) => {
  try {
    const sql = getSqlClient();
    const result = await sql.query<{ database: string; migration: string | null }>(
      `select current_database() as database,
              (select max(filename) from public.schema_migrations) as migration`,
    );
    return context.json({
      service: "beauty-management-api",
      status: "ready",
      database: "connected",
      databaseName: result.rows[0]?.database,
      migration: result.rows[0]?.migration ?? "untracked",
    });
  } catch (error) {
    const requestId = context.req.header("x-request-id") ?? crypto.randomUUID();
    console.error("Database readiness failed", { requestId, error });
    return context.json({ service: "beauty-management-api", status: "not_ready", database: "unavailable", requestId }, 503);
  }
});

registerBusinessRoutes(app);
registerAdministrationRoutes(app);
registerEquipmentRoutes(app);
registerPackageRoutes(app);
registerTenantExperienceRoutes(app);
registerTenantContextRoutes(app);
registerExtractedContextRoutes(app);

export default app;
