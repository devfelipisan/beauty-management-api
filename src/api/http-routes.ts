import type { Hono } from "hono";
import { parseBusinessCommandInput, type BusinessCommand } from "@/api/contracts";
import { getBusinessApi } from "@/config/dependencies";
import { Permissions, type PermissionCode } from "@/server/auth/permissions";
import { createExecutionContext } from "@/shared/application/execution-context";
import { ContractValidationError } from "@/shared/contracts/runtime-schema";
import { DomainError } from "@/shared/domain/core";

function authSubject(request: Request, platform = false): string {
  const header = request.headers.get("authorization")?.trim();
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return platform ? "user-platform-admin" : "user-tenant-admin";
}

function tenantId(request: Request): string {
  const value = request.headers.get("x-tenant-id")?.trim();
  if (!value) throw new DomainError("TENANT_HEADER_REQUIRED", "x-tenant-id is required for tenant operations.");
  return value;
}

function contextFor(request: Request, operation: string, tenant?: string, actor?: string) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  return createExecutionContext(operation, {
    requestId,
    correlationId: request.headers.get("x-correlation-id") ?? requestId,
    tenantId: tenant,
    actorId: actor,
    source: "api",
  });
}

async function bodyFor(request: Request, command: BusinessCommand): Promise<unknown> {
  const raw = await request.json().catch(() => ({}));
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  const value = idempotencyKey && raw && typeof raw === "object" && !Array.isArray(raw) && !("idempotencyKey" in raw)
    ? { ...(raw as Record<string, unknown>), idempotencyKey }
    : raw;
  return parseBusinessCommandInput(command, value);
}

async function authorizeTenant(request: Request, permission: PermissionCode) {
  const api = getBusinessApi();
  const tenant = tenantId(request);
  const subject = authSubject(request);
  const access = await api.authorizeTenant(subject, tenant, permission);
  return { api, tenant, actorId: access.actorId };
}

function isForbiddenCode(code: string): boolean {
  return code.includes("FORBIDDEN") || code.includes("PERMISSION") || code.includes("MEMBERSHIP");
}

export function registerBusinessRoutes(app: Hono) {
  app.onError((error, context) => {
    const requestId = context.req.header("x-request-id") ?? crypto.randomUUID();
    context.header("x-request-id", requestId);
    if (error instanceof ContractValidationError) {
      return context.json({ error: { code: error.code, message: error.message, issues: error.issues }, requestId }, 400);
    }
    if (error instanceof DomainError) {
      const payload = { error: { code: error.code, message: error.message, details: error.details }, requestId };
      if (error.code === "NOT_FOUND") return context.json(payload, 404);
      if (isForbiddenCode(error.code)) return context.json(payload, 403);
      return context.json(payload, 409);
    }
    console.error("Unhandled API error", error);
    return context.json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error." }, requestId }, 500);
  });

  app.get("/v1/customers", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.CustomerRead);
    return c.json(await api.listCustomers(contextFor(c.req.raw, "customer.list", tenant, actorId)));
  });
  app.post("/v1/customers", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.CustomerCreate);
    const input = await bodyFor(c.req.raw, "customer.create");
    return c.json(await api.createCustomer(contextFor(c.req.raw, "customer.create", tenant, actorId), input as never), 201);
  });

  app.get("/v1/professionals", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.ProfessionalRead);
    return c.json(await api.listProfessionals(contextFor(c.req.raw, "professional.list", tenant, actorId)));
  });
  app.post("/v1/professionals", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.ProfessionalCreate);
    const input = await bodyFor(c.req.raw, "professional.create");
    return c.json(await api.createProfessional(contextFor(c.req.raw, "professional.create", tenant, actorId), input as never), 201);
  });

  app.get("/v1/services", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.ServiceRead);
    return c.json(await api.listServices(contextFor(c.req.raw, "service.list", tenant, actorId)));
  });
  app.post("/v1/services", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.ServiceCreate);
    const input = await bodyFor(c.req.raw, "service.create");
    return c.json(await api.createService(contextFor(c.req.raw, "service.create", tenant, actorId), input as never), 201);
  });

  app.get("/v1/appointments", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.AppointmentRead);
    return c.json(await api.listAppointments(contextFor(c.req.raw, "appointment.list", tenant, actorId)));
  });
  app.post("/v1/appointments", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.AppointmentCreate);
    const input = await bodyFor(c.req.raw, "appointment.create");
    return c.json(await api.createAppointment(contextFor(c.req.raw, "appointment.create", tenant, actorId), input as never), 201);
  });
  app.get("/v1/appointments/:appointmentId/actions", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.AppointmentRead);
    return c.json(await api.getAppointmentActions(contextFor(c.req.raw, "appointment.actions", tenant, actorId), c.req.param("appointmentId")));
  });

  app.post("/v1/deposits/confirm", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.DepositConfirm);
    const input = await bodyFor(c.req.raw, "deposit.confirm");
    return c.json(await api.confirmDeposit(contextFor(c.req.raw, "deposit.confirm", tenant, actorId), input as never));
  });

  app.post("/v1/sessions/start", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.SessionStart);
    const input = await bodyFor(c.req.raw, "session.start");
    return c.json(await api.startSession(contextFor(c.req.raw, "session.start", tenant, actorId), input as never), 201);
  });
  app.post("/v1/sessions/complete", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.SessionComplete);
    const input = await bodyFor(c.req.raw, "session.complete");
    return c.json(await api.completeSession(contextFor(c.req.raw, "session.complete", tenant, actorId), input as never));
  });

  app.post("/v1/payments", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.PaymentCreate);
    const input = await bodyFor(c.req.raw, "payment.register");
    return c.json(await api.registerPayment(contextFor(c.req.raw, "payment.register", tenant, actorId), input as never), 201);
  });

  app.get("/v1/leads", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.CustomerRead);
    return c.json(await api.listLeads(contextFor(c.req.raw, "lead.list", tenant, actorId)));
  });
  app.get("/v1/leads/:leadId/actions", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.CustomerRead);
    return c.json(await api.getLeadActions(contextFor(c.req.raw, "lead.actions", tenant, actorId), c.req.param("leadId")));
  });
  app.patch("/v1/leads/:leadId/status", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.CustomerUpdate);
    const parsed = await bodyFor(c.req.raw, "lead.status.update") as { action: never };
    return c.json(await api.updateLeadStatus(contextFor(c.req.raw, "lead.status.update", tenant, actorId), { leadId: c.req.param("leadId"), action: parsed.action }));
  });

  app.get("/v1/audit", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.AuditRead);
    return c.json(await api.listAuditEvents(contextFor(c.req.raw, "audit.list", tenant, actorId)));
  });

  app.get("/v1/tenant-branding", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.TenantRead);
    return c.json(await api.getTenantBranding(contextFor(c.req.raw, "tenant-branding.get", tenant, actorId)));
  });
  app.patch("/v1/tenant-branding", async (c) => {
    const { api, tenant, actorId } = await authorizeTenant(c.req.raw, Permissions.TenantBrandingUpdate);
    const input = await bodyFor(c.req.raw, "tenant-branding.update");
    return c.json(await api.updateTenantBranding(contextFor(c.req.raw, "tenant-branding.update", tenant, actorId), input as never));
  });

  app.post("/v1/tenants", async (c) => {
    const api = getBusinessApi();
    const subject = authSubject(c.req.raw, true);
    const access = await api.authorizePlatform(subject, Permissions.PlatformTenantCreate);
    const input = await bodyFor(c.req.raw, "tenant.create");
    return c.json(await api.createTenant(contextFor(c.req.raw, "tenant.create", undefined, access.actorId), input as never), 201);
  });

  app.get("/v1/public/:slug/catalog", async (c) => {
    const api = getBusinessApi();
    return c.json(await api.getPublicCatalogBySlug(contextFor(c.req.raw, "public.catalog"), c.req.param("slug")));
  });
  app.post("/v1/public/:slug/appointments", async (c) => {
    const api = getBusinessApi();
    const input = await bodyFor(c.req.raw, "public-appointment.create");
    return c.json(await api.createPublicAppointmentBySlug(contextFor(c.req.raw, "public-appointment.create"), c.req.param("slug"), input as never), 201);
  });
  app.post("/v1/public/:slug/leads", async (c) => {
    const api = getBusinessApi();
    const input = await bodyFor(c.req.raw, "public-lead.create");
    return c.json(await api.createPublicLeadBySlug(contextFor(c.req.raw, "public-lead.create"), c.req.param("slug"), input as never), 201);
  });
}
