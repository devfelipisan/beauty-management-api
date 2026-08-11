import type { Hono } from "hono";
import { parseBusinessCommandInput, type BusinessCommand } from "@/api/contracts";
import { authorizePlatformRequest, authorizeTenantRequest, createApiExecutionContext } from "@/api/request-security";
import { getBusinessApi } from "@/config/dependencies";
import { AuthenticationRequiredError } from "@/server/auth/authentication";
import { Permissions, type PermissionCode } from "@/server/auth/permissions";
import { ContractValidationError } from "@/shared/contracts/runtime-schema";
import { DomainError } from "@/shared/domain/core";

async function bodyFor(request: Request, command: BusinessCommand): Promise<unknown> {
  const raw = await request.json().catch(() => ({}));
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  const value = idempotencyKey && raw && typeof raw === "object" && !Array.isArray(raw) && !("idempotencyKey" in raw)
    ? { ...(raw as Record<string, unknown>), idempotencyKey }
    : raw;
  return parseBusinessCommandInput(command, value);
}

async function authorizeTenant(request: Request, permission: PermissionCode) {
  return authorizeTenantRequest(request, permission);
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
    if (error instanceof AuthenticationRequiredError || (error instanceof DomainError && error.code === "AUTHENTICATION_REQUIRED")) {
      return context.json({ error: { code: "AUTHENTICATION_REQUIRED", message: error.message }, requestId }, 401);
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
    const { api, tenantId, actorId, access } = await authorizeTenant(c.req.raw, Permissions.CustomerRead);
    const context = createApiExecutionContext(c.req.raw, "customer.list", tenantId, actorId);
    const customers = await api.listCustomers(context);
    if (!access.professionalId) return c.json(customers);
    const appointments = await api.listAppointments(context);
    const linkedCustomerIds = new Set(
      appointments
        .filter((appointment) => appointment.professionalId === access.professionalId)
        .map((appointment) => appointment.customerId),
    );
    return c.json(customers.filter((customer) => linkedCustomerIds.has(customer.id)));
  });
  app.post("/v1/customers", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenant(c.req.raw, Permissions.CustomerCreate);
    const input = await bodyFor(c.req.raw, "customer.create");
    return c.json(await api.createCustomer(createApiExecutionContext(c.req.raw, "customer.create", tenantId, actorId), input as never), 201);
  });

  app.get("/v1/professionals", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenant(c.req.raw, Permissions.ProfessionalRead);
    return c.json(await api.listProfessionals(createApiExecutionContext(c.req.raw, "professional.list", tenantId, actorId)));
  });
  app.post("/v1/professionals", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenant(c.req.raw, Permissions.ProfessionalCreate);
    const input = await bodyFor(c.req.raw, "professional.create");
    return c.json(await api.createProfessional(createApiExecutionContext(c.req.raw, "professional.create", tenantId, actorId), input as never), 201);
  });

  app.get("/v1/services", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenant(c.req.raw, Permissions.ServiceRead);
    return c.json(await api.listServices(createApiExecutionContext(c.req.raw, "service.list", tenantId, actorId)));
  });
  app.post("/v1/services", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenant(c.req.raw, Permissions.ServiceCreate);
    const input = await bodyFor(c.req.raw, "service.create");
    return c.json(await api.createService(createApiExecutionContext(c.req.raw, "service.create", tenantId, actorId), input as never), 201);
  });

  app.get("/v1/appointments", async (c) => {
    const { api, tenantId, actorId, access } = await authorizeTenant(c.req.raw, Permissions.AppointmentRead);
    const appointments = await api.listAppointments(createApiExecutionContext(c.req.raw, "appointment.list", tenantId, actorId));
    return c.json(
      access.professionalId
        ? appointments.filter((appointment) => appointment.professionalId === access.professionalId)
        : appointments,
    );
  });
  app.post("/v1/appointments", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenant(c.req.raw, Permissions.AppointmentCreate);
    const input = await bodyFor(c.req.raw, "appointment.create");
    return c.json(await api.createAppointment(createApiExecutionContext(c.req.raw, "appointment.create", tenantId, actorId), input as never), 201);
  });
  app.get("/v1/appointments/:appointmentId/actions", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenant(c.req.raw, Permissions.AppointmentRead);
    return c.json(await api.getAppointmentActions(createApiExecutionContext(c.req.raw, "appointment.actions", tenantId, actorId), c.req.param("appointmentId")));
  });

  app.post("/v1/deposits/confirm", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenant(c.req.raw, Permissions.DepositConfirm);
    const input = await bodyFor(c.req.raw, "deposit.confirm");
    return c.json(await api.confirmDeposit(createApiExecutionContext(c.req.raw, "deposit.confirm", tenantId, actorId), input as never));
  });

  app.post("/v1/sessions/start", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenant(c.req.raw, Permissions.SessionStart);
    const input = await bodyFor(c.req.raw, "session.start");
    return c.json(await api.startSession(createApiExecutionContext(c.req.raw, "session.start", tenantId, actorId), input as never), 201);
  });
  app.post("/v1/sessions/complete", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenant(c.req.raw, Permissions.SessionComplete);
    const input = await bodyFor(c.req.raw, "session.complete");
    return c.json(await api.completeSession(createApiExecutionContext(c.req.raw, "session.complete", tenantId, actorId), input as never));
  });

  app.get("/v1/payments", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenant(c.req.raw, Permissions.PaymentRead);
    return c.json(await api.listPayments(createApiExecutionContext(c.req.raw, "payment.list", tenantId, actorId)));
  });
  app.post("/v1/payments", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenant(c.req.raw, Permissions.PaymentCreate);
    const input = await bodyFor(c.req.raw, "payment.register");
    return c.json(await api.registerPayment(createApiExecutionContext(c.req.raw, "payment.register", tenantId, actorId), input as never), 201);
  });

  app.get("/v1/leads", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenant(c.req.raw, Permissions.CustomerRead);
    return c.json(await api.listLeads(createApiExecutionContext(c.req.raw, "lead.list", tenantId, actorId)));
  });
  app.get("/v1/leads/:leadId/actions", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenant(c.req.raw, Permissions.CustomerRead);
    return c.json(await api.getLeadActions(createApiExecutionContext(c.req.raw, "lead.actions", tenantId, actorId), c.req.param("leadId")));
  });
  app.patch("/v1/leads/:leadId/status", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenant(c.req.raw, Permissions.CustomerUpdate);
    const parsed = await bodyFor(c.req.raw, "lead.status.update") as { action: never };
    return c.json(await api.updateLeadStatus(createApiExecutionContext(c.req.raw, "lead.status.update", tenantId, actorId), { leadId: c.req.param("leadId"), action: parsed.action }));
  });

  app.get("/v1/audit", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenant(c.req.raw, Permissions.AuditRead);
    return c.json(await api.listAuditEvents(createApiExecutionContext(c.req.raw, "audit.list", tenantId, actorId)));
  });

  app.get("/v1/tenant-branding", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenant(c.req.raw, Permissions.TenantRead);
    return c.json(await api.getTenantBranding(createApiExecutionContext(c.req.raw, "tenant-branding.get", tenantId, actorId)));
  });
  app.patch("/v1/tenant-branding", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenant(c.req.raw, Permissions.TenantBrandingUpdate);
    const input = await bodyFor(c.req.raw, "tenant-branding.update");
    return c.json(await api.updateTenantBranding(createApiExecutionContext(c.req.raw, "tenant-branding.update", tenantId, actorId), input as never));
  });

  app.post("/v1/tenants", async (c) => {
    const { api, actorId } = await authorizePlatformRequest(c.req.raw, Permissions.PlatformTenantCreate);
    const input = await bodyFor(c.req.raw, "tenant.create");
    return c.json(await api.createTenant(createApiExecutionContext(c.req.raw, "tenant.create", undefined, actorId), input as never), 201);
  });

  app.get("/v1/public/:slug/catalog", async (c) => {
    const api = getBusinessApi();
    return c.json(await api.getPublicCatalogBySlug(createApiExecutionContext(c.req.raw, "public.catalog"), c.req.param("slug")));
  });
  app.post("/v1/public/:slug/appointments", async (c) => {
    const api = getBusinessApi();
    const input = await bodyFor(c.req.raw, "public-appointment.create");
    return c.json(await api.createPublicAppointmentBySlug(createApiExecutionContext(c.req.raw, "public-appointment.create"), c.req.param("slug"), input as never), 201);
  });
  app.post("/v1/public/:slug/leads", async (c) => {
    const api = getBusinessApi();
    const input = await bodyFor(c.req.raw, "public-lead.create");
    return c.json(await api.createPublicLeadBySlug(createApiExecutionContext(c.req.raw, "public-lead.create"), c.req.param("slug"), input as never), 201);
  });
}
