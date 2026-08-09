import { Hono } from "hono";

const app = new Hono();

app.get("/health", (context) =>
  context.json({
    service: "beauty-management-api",
    status: "ok",
    businessApiMigration: "foundation",
  }),
);

export default app;
