import assert from "node:assert/strict";
import test from "node:test";
import {
  readDatabaseRuntimeConfig,
  readSupabaseAuthConfig,
  RuntimeConfigurationError,
} from "../config/supabase-config.ts";
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

test("DATABASE_URL is sufficient for Worker runtime database configuration", () => {
  const config = readDatabaseRuntimeConfig({
    DATABASE_URL: "postgresql://worker:secret@pooler.example.com:6543/postgres?sslmode=require",
  });

  assert.equal(config.source, "database_url");
  assert.equal(
    config.runtimeConnectionString,
    "postgresql://worker:secret@pooler.example.com:6543/postgres?sslmode=require",
  );
});

test("decomposed runtime database configuration does not infer a host from region", () => {
  assert.throws(
    () => readDatabaseRuntimeConfig({
      SPRegionDB: "sa-east-1",
      SBNameDB: "postgres",
      SPPasswordDB: "secret",
      SPIdBD: "project-ref",
    }),
    (error: unknown) => error instanceof RuntimeConfigurationError
      && error.variable === "SBDatabaseHost",
  );
});

test("decomposed runtime database configuration supports explicit pooler bindings", () => {
  const config = readDatabaseRuntimeConfig({
    SBDatabaseHost: "pooler.example.com",
    SBDatabasePort: "6543",
    SBDatabaseUser: "postgres.project-ref",
    SBNameDB: "postgres",
    SPPasswordDB: "p@ss word",
  });

  assert.equal(config.source, "components");
  assert.match(config.runtimeConnectionString, /^postgresql:\/\/postgres.project-ref:p%40ss%20word@pooler\.example\.com:6543\/postgres\?sslmode=require$/);
});

test("Supabase Auth configuration is independent from database runtime configuration", () => {
  const config = readSupabaseAuthConfig({
    SPIdBD: "zkzzptgbiwsxinzmfvss",
    ApiKeySupaBase: "publishable-key",
  });

  assert.equal(config.supabaseUrl, "https://zkzzptgbiwsxinzmfvss.supabase.co");
  assert.equal(config.apiKey, "publishable-key");
});
