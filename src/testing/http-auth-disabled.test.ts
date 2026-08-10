import assert from "node:assert/strict";
import test from "node:test";
import app from "@/index";

const readPaths = [
  "/v1/professionals",
  "/v1/services",
  "/v1/customers",
  "/v1/appointments",
  "/v1/payments",
  "/v1/leads",
  "/v1/users",
  "/v1/relationship-profile-configs",
  "/v1/discount-policies",
  "/v1/discount-approvals",
] as const;

async function withDisabledAuth(work: () => Promise<void>) {
  const previousAuthMode = process.env.API_AUTH_MODE;
  const previousSubject = process.env.API_DEV_AUTH_SUBJECT;
  const previousTenant = process.env.API_DEV_TENANT_ID;

  process.env.API_AUTH_MODE = "disabled";
  process.env.API_DEV_AUTH_SUBJECT = "user-tenant-admin";
  process.env.API_DEV_TENANT_ID = "tenant-bella";

  try {
    await work();
  } finally {
    if (previousAuthMode === undefined) delete process.env.API_AUTH_MODE;
    else process.env.API_AUTH_MODE = previousAuthMode;
    if (previousSubject === undefined) delete process.env.API_DEV_AUTH_SUBJECT;
    else process.env.API_DEV_AUTH_SUBJECT = previousSubject;
    if (previousTenant === undefined) delete process.env.API_DEV_TENANT_ID;
    else process.env.API_DEV_TENANT_ID = previousTenant;
  }
}

test("auth-disabled mode serves tenant and administration reads without Authorization or x-tenant-id", async () => {
  await withDisabledAuth(async () => {
    for (const path of readPaths) {
      const response = await app.request(path);
      const body = await response.text();
      assert.equal(response.status, 200, `${path} returned ${response.status}: ${body}`);
      assert.doesNotThrow(() => JSON.parse(body));
    }
  });
});

test("tenant settings accepts blank optional form values", async () => {
  await withDisabledAuth(async () => {
    const response = await app.request("/v1/tenant/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Clínica Bella",
        legalName: "",
        document: "",
        phone: "",
        email: "",
        address: "",
        city: "",
        state: "",
        postalCode: "",
        primaryUnitName: "",
        timezone: "America/Sao_Paulo",
        locale: "pt-BR",
        currency: "BRL",
        weekStartsOn: "monday",
        themeMode: "system",
        interfaceDensity: "comfortable",
        radius: "soft",
        shortName: "",
        showBrandName: true,
        showBreadcrumbs: true,
        showDashboardShortcuts: true,
        compactNavigation: false,
        defaultAgendaView: "day",
        sessionTimeoutMinutes: 30,
        logoutOnInactivity: true,
        privacyContact: "",
      }),
    });
    const body = await response.text();
    assert.equal(response.status, 200, body);
  });
});

test("landing page draft accepts blank optional contact and social fields", async () => {
  await withDisabledAuth(async () => {
    const response = await app.request("/v1/tenant/landing-page/draft", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug: "bella-estetica",
        template: "editorial_clean",
        brandName: "Bella Estética",
        heroTitle: "Cuidado, beleza e confiança",
        heroSubtitle: "",
        heroDescription: "",
        ctaLabel: "Solicitar atendimento",
        about: "",
        whatsapp: "",
        phone: "",
        email: "",
        address: "",
        businessHours: "",
        instagram: "",
        facebook: "",
        publicServiceIds: [],
        publicProfessionalIds: [],
        galleryFileIds: [],
      }),
    });
    const body = await response.text();
    assert.equal(response.status, 200, body);
  });
});
