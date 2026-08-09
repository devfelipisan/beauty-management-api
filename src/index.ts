import { Hono } from "hono";

const app = new Hono();

const healthPayload = {
  service: "beauty-management-api",
  status: "ok",
  businessApiMigration: "domain-and-transactional-rules",
  apiBasePath: "/v1",
};

app.get("/health", (context) => context.json(healthPayload));
app.get("/v1/health", (context) => context.json(healthPayload));

export default app;
