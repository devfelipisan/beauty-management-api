import assert from "node:assert/strict";
import test from "node:test";
import { assertValidPublicTenantSlug, normalizePublicTenantSlug, publicTenantSlug } from "../modules/tenants/domain/public-tenant-slug.ts";
import { stableRequestHash } from "../shared/idempotency/idempotency.ts";

test("request hash is deterministic regardless of object key order", () => {
  assert.equal(
    stableRequestHash({ customerId: "1", amount: 100 }),
    stableRequestHash({ amount: 100, customerId: "1" }),
  );
  assert.notEqual(
    stableRequestHash({ customerId: "1", amount: 100 }),
    stableRequestHash({ customerId: "1", amount: 101 }),
  );
});

test("tenant slug normalization is deterministic and URL safe", () => {
  assert.equal(normalizePublicTenantSlug(" Clínica Bella Estética "), "clinica-bella-estetica");
  assert.equal(assertValidPublicTenantSlug("Bella Estética"), "bella-estetica");
});

test("reserved tenant slugs are rejected", () => {
  assert.throws(() => assertValidPublicTenantSlug("api"), (error: unknown) => {
    return error instanceof Error && "code" in error && error.code === "TENANT_SLUG_RESERVED";
  });
});

test("configured tenant slug wins over the display-name migration fallback", () => {
  assert.equal(publicTenantSlug({ displayName: "Clínica Bella", publicSlug: "bella-estetica" }), "bella-estetica");
  assert.equal(publicTenantSlug({ displayName: "Clínica Bella" }), "clinica-bella");
});
