import { Hono } from "hono";
import { registerBusinessRoutes } from "@/api/http-routes";

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

export default app;
