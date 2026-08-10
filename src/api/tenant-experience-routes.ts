import type { Hono } from "hono";
import { authorizeTenantRequest, createApiExecutionContext } from "@/api/request-security";
import { Permissions } from "@/server/auth/permissions";
import { arraySchema, booleanSchema, enumSchema, numberSchema, objectSchema, stringSchema, type RuntimeSchema } from "@/shared/contracts/runtime-schema";
import type { UpdateTenantSettingsInput } from "@/modules/tenant-settings/domain/tenant-settings";
import type { SaveLandingPageDraftInput } from "@/modules/landing-page/domain/landing-page";

const text = (max = 500) => stringSchema({ min: 1, max, trim: true });

/**
 * HTML forms naturally submit empty strings for optional text controls. At the
 * HTTP boundary an empty/whitespace-only optional field is normalized to
 * `undefined` so the domain never has to distinguish between "" and absence.
 */
const optionalText = (max = 500): RuntimeSchema<string | undefined> => ({
  parse(value, path = "$") {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string" && value.trim() === "") return undefined;
    return text(max).parse(value, path);
  },
});

const tenantSettingsSchema = objectSchema({
  displayName: text(160), legalName: optionalText(200), document: optionalText(40), phone: optionalText(40), email: optionalText(254),
  address: optionalText(300), city: optionalText(120), state: optionalText(80), postalCode: optionalText(30), primaryUnitName: optionalText(120),
  timezone: text(100), locale: text(20), currency: text(10), weekStartsOn: enumSchema(["monday", "sunday"] as const),
  themeMode: enumSchema(["light", "dark", "system"] as const), interfaceDensity: enumSchema(["comfortable", "compact"] as const),
  radius: enumSchema(["subtle", "soft", "rounded"] as const), shortName: optionalText(80), showBrandName: booleanSchema(), showBreadcrumbs: booleanSchema(),
  showDashboardShortcuts: booleanSchema(), compactNavigation: booleanSchema(), defaultAgendaView: enumSchema(["day", "week", "month"] as const),
  sessionTimeoutMinutes: numberSchema({ integer: true, min: 5, max: 1440 }), logoutOnInactivity: booleanSchema(), privacyContact: optionalText(254),
});

const landingDraftSchema = objectSchema({
  slug: text(63), template: enumSchema(["editorial_clean", "institutional_light", "minimal"] as const), brandName: text(160), heroTitle: text(200),
  heroSubtitle: optionalText(240), heroDescription: optionalText(1000), ctaLabel: text(80), about: optionalText(3000), whatsapp: optionalText(80), phone: optionalText(80),
  email: optionalText(254), address: optionalText(500), businessHours: optionalText(1000), instagram: optionalText(300), facebook: optionalText(300),
  publicServiceIds: arraySchema(text(128), { max: 100 }), publicProfessionalIds: arraySchema(text(128), { max: 100 }), galleryFileIds: arraySchema(text(128), { max: 100 }),
});

export function registerTenantExperienceRoutes(app: Hono) {
  app.get("/v1/tenant/settings", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.TenantRead);
    return c.json(await api.getTenantSettings(createApiExecutionContext(c.req.raw, "tenant-settings.get", tenantId, actorId)));
  });
  app.put("/v1/tenant/settings", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.TenantSettingsUpdate);
    const input = tenantSettingsSchema.parse(await c.req.json()) as UpdateTenantSettingsInput;
    return c.json(await api.updateTenantSettings(createApiExecutionContext(c.req.raw, "tenant-settings.update", tenantId, actorId), input));
  });
  app.get("/v1/tenant/landing-page", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.LandingPageRead);
    return c.json(await api.getLandingPage(createApiExecutionContext(c.req.raw, "landing-page.get", tenantId, actorId)));
  });
  app.put("/v1/tenant/landing-page/draft", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.LandingPageManage);
    const input = landingDraftSchema.parse(await c.req.json()) as SaveLandingPageDraftInput;
    return c.json(await api.saveLandingPageDraft(createApiExecutionContext(c.req.raw, "landing-page.draft.save", tenantId, actorId), input));
  });
  app.post("/v1/tenant/landing-page/publish", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.LandingPageManage);
    return c.json(await api.publishLandingPage(createApiExecutionContext(c.req.raw, "landing-page.publish", tenantId, actorId)));
  });
  app.post("/v1/tenant/landing-page/hide", async (c) => {
    const { api, tenantId, actorId } = await authorizeTenantRequest(c.req.raw, Permissions.LandingPageManage);
    return c.json(await api.hideLandingPage(createApiExecutionContext(c.req.raw, "landing-page.hide", tenantId, actorId)));
  });
}
