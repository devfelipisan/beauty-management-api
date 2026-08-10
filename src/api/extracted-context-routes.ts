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

async function authorize(request: Request, permission: Parameters<ReturnType<typeof getBusinessApi>["authorizeTenant"]>[2]) {
  const api = getBusinessApi();
  const tenant = tenantId(request);
  const access = await api.authorizeTenant(authSubject(request), tenant, permission);
  return { api, tenant, actorId: access.actorId };
}

export function registerExtractedContextRoutes(app: Hono) {
  app.get("/v1/customers/:customerId/assessments", async (c) => {
    const { api, tenant, actorId } = await authorize(c.req.raw, Permissions.AssessmentRead);
    return c.json(await api.listAssessments(contextFor(c.req.raw, "assessment.list", tenant, actorId), c.req.param("customerId")));
  });
  app.post("/v1/assessments", async (c) => {
    const { api, tenant, actorId } = await authorize(c.req.raw, Permissions.AssessmentCreate);
    const input = parseBusinessCommandInput("assessment.create", await c.req.raw.json().catch(() => ({})));
    return c.json(await api.createAssessment(contextFor(c.req.raw, "assessment.create", tenant, actorId), input as never), 201);
  });

  app.get("/v1/sessions/:sessionId/technical-records", async (c) => {
    const { api, tenant, actorId } = await authorize(c.req.raw, Permissions.TechnicalRecordRead);
    return c.json(await api.listTechnicalRecords(contextFor(c.req.raw, "technical-record.list", tenant, actorId), c.req.param("sessionId")));
  });
  app.post("/v1/technical-records", async (c) => {
    const { api, tenant, actorId } = await authorize(c.req.raw, Permissions.TechnicalRecordCreate);
    const input = parseBusinessCommandInput("technical-record.create", await c.req.raw.json().catch(() => ({})));
    return c.json(await api.createTechnicalRecord(contextFor(c.req.raw, "technical-record.create", tenant, actorId), input as never), 201);
  });

  app.get("/v1/follow-ups", async (c) => {
    const { api, tenant, actorId } = await authorize(c.req.raw, Permissions.FollowUpRead);
    return c.json(await api.listFollowUps(contextFor(c.req.raw, "follow-up.list", tenant, actorId)));
  });
  app.post("/v1/follow-ups", async (c) => {
    const { api, tenant, actorId } = await authorize(c.req.raw, Permissions.FollowUpCreate);
    const input = parseBusinessCommandInput("follow-up.create", await c.req.raw.json().catch(() => ({})));
    return c.json(await api.createFollowUp(contextFor(c.req.raw, "follow-up.create", tenant, actorId), input as never), 201);
  });
  app.get("/v1/follow-ups/:followUpId/actions", async (c) => {
    const { api, tenant, actorId } = await authorize(c.req.raw, Permissions.FollowUpRead);
    return c.json(await api.getFollowUpActions(contextFor(c.req.raw, "follow-up.actions", tenant, actorId), c.req.param("followUpId")));
  });
  app.patch("/v1/follow-ups/:followUpId/status", async (c) => {
    const { api, tenant, actorId } = await authorize(c.req.raw, Permissions.FollowUpManage);
    const input = parseBusinessCommandInput("follow-up.status.update", await c.req.raw.json().catch(() => ({}))) as { action: never; appointmentId?: string };
    return c.json(await api.updateFollowUpStatus(contextFor(c.req.raw, "follow-up.status.update", tenant, actorId), {
      followUpId: c.req.param("followUpId"),
      action: input.action,
      appointmentId: input.appointmentId,
    }));
  });
}
