import type { Hono } from "hono";
import { parseBusinessCommandInput } from "@/api/contracts";
import { authorizeTenantRequest, createApiExecutionContext } from "@/api/request-security";
import { Permissions } from "@/server/auth/permissions";

export function registerExtractedContextRoutes(app: Hono) {
  app.get("/v1/customers/:customerId/assessments", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.AssessmentRead);
    return c.json(await api.listAssessments(createApiExecutionContext(c.req.raw, "assessment.list", tenantId, actorId), c.req.param("customerId")));
  });
  app.post("/v1/assessments", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.AssessmentCreate);
    const input = parseBusinessCommandInput("assessment.create", await c.req.raw.json().catch(() => ({})));
    return c.json(await api.createAssessment(createApiExecutionContext(c.req.raw, "assessment.create", tenantId, actorId), input as never), 201);
  });

  app.get("/v1/sessions/:sessionId/technical-records", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.TechnicalRecordRead);
    return c.json(await api.listTechnicalRecords(createApiExecutionContext(c.req.raw, "technical-record.list", tenantId, actorId), c.req.param("sessionId")));
  });
  app.post("/v1/technical-records", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.TechnicalRecordCreate);
    const input = parseBusinessCommandInput("technical-record.create", await c.req.raw.json().catch(() => ({})));
    return c.json(await api.createTechnicalRecord(createApiExecutionContext(c.req.raw, "technical-record.create", tenantId, actorId), input as never), 201);
  });

  app.get("/v1/follow-ups", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.FollowUpRead);
    return c.json(await api.listFollowUps(createApiExecutionContext(c.req.raw, "follow-up.list", tenantId, actorId)));
  });
  app.post("/v1/follow-ups", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.FollowUpCreate);
    const input = parseBusinessCommandInput("follow-up.create", await c.req.raw.json().catch(() => ({})));
    return c.json(await api.createFollowUp(createApiExecutionContext(c.req.raw, "follow-up.create", tenantId, actorId), input as never), 201);
  });
  app.get("/v1/follow-ups/:followUpId/actions", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.FollowUpRead);
    return c.json(await api.getFollowUpActions(createApiExecutionContext(c.req.raw, "follow-up.actions", tenantId, actorId), c.req.param("followUpId")));
  });
  app.patch("/v1/follow-ups/:followUpId/status", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.FollowUpManage);
    const input = parseBusinessCommandInput("follow-up.status.update", await c.req.raw.json().catch(() => ({}))) as { action: never; appointmentId?: string };
    return c.json(await api.updateFollowUpStatus(createApiExecutionContext(c.req.raw, "follow-up.status.update", tenantId, actorId), {
      followUpId: c.req.param("followUpId"),
      action: input.action,
      appointmentId: input.appointmentId,
    }));
  });
}
