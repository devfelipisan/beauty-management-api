import type { Hono } from "hono";
import { authorizeTenantRequest, createApiExecutionContext, resolveAuthenticatedTenant, authenticateRequest } from "@/api/request-security";
import { getAuthorizationService } from "@/config/dependencies";
import type { TenantAccess } from "@/server/auth/authorization";
import { Permissions } from "@/server/auth/permissions";
import { DomainError } from "@/shared/domain/core";

function tenantSummary(access: TenantAccess) {
  return {
    id: access.tenantId,
    displayName: access.tenantDisplayName,
    publicSlug: access.tenantPublicSlug,
    status: access.tenantStatus,
    selectable: access.membershipStatus === "active" && (access.tenantStatus === "active" || access.tenantStatus === "trial"),
    membership: {
      id: access.membershipId,
      status: access.membershipStatus,
      roles: access.roles,
      professionalId: access.professionalId,
    },
  };
}

export function registerTenantContextRoutes(app: Hono) {
  app.get("/v1/me/tenants", async (c) => {
    const identity = await authenticateRequest(c.req.raw);
    const accesses = await getAuthorizationService().listTenantMemberships(identity.subject);
    return c.json({ items: accesses.map(tenantSummary) });
  });

  app.get("/v1/me/context", async (c) => {
    const { identity, access } = await resolveAuthenticatedTenant(c.req.raw);
    return c.json({
      user: { subject: identity.subject, email: identity.email },
      tenant: tenantSummary(access),
    });
  });

  app.get("/v1/me/appointments", async (c) => {
    const { api, access } = await authorizeTenantRequest(c.req.raw, Permissions.AppointmentReadOwn);
    if (!access.professionalId) {
      throw new DomainError(
        "PROFESSIONAL_CONTEXT_REQUIRED",
        "The current tenant membership is not linked to a professional profile.",
      );
    }
    const context = createApiExecutionContext(c.req.raw, "appointment.list-own", access);
    const appointments = await api.listAppointments(context);
    return c.json(appointments.filter((appointment) => appointment.professionalId === access.professionalId));
  });

  app.get("/v1/me/customers", async (c) => {
    const { api, access } = await authorizeTenantRequest(c.req.raw, Permissions.CustomerReadLinked);
    if (!access.professionalId) {
      throw new DomainError(
        "PROFESSIONAL_CONTEXT_REQUIRED",
        "The current tenant membership is not linked to a professional profile.",
      );
    }
    const context = createApiExecutionContext(c.req.raw, "customer.list-linked", access);
    const [appointments, customers] = await Promise.all([
      api.listAppointments(context),
      api.listCustomers(context),
    ]);
    const customerIds = new Set(
      appointments
        .filter((appointment) => appointment.professionalId === access.professionalId)
        .map((appointment) => appointment.customerId),
    );
    return c.json(customers.filter((customer) => customerIds.has(customer.id)));
  });
}
