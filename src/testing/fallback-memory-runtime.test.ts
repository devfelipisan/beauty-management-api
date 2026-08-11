import assert from "node:assert/strict";
import test from "node:test";
import { readRuntimeDataSourceConfig } from "../config/runtime-data-source.ts";
import { MemoryWorkspaceContextRepository } from "../infrastructure/memory/memory-fallback-repositories.ts";
import {
  createMemoryVolumeSeed,
  FALLBACK_TENANT_ID,
  FALLBACK_TENANT_SLUG,
} from "../infrastructure/memory/memory-volume-seed.ts";

test("runtime data source defaults to postgres and switches only explicitly to memory", () => {
  assert.equal(readRuntimeDataSourceConfig({}).dataSource, "postgres");
  assert.equal(readRuntimeDataSourceConfig({ API_DATA_SOURCE: "postgres" }).dataSource, "postgres");
  assert.equal(readRuntimeDataSourceConfig({ API_DATA_SOURCE: "memory" }).dataSource, "memory");
  assert.throws(() => readRuntimeDataSourceConfig({ API_DATA_SOURCE: "mock" }), /Unsupported API_DATA_SOURCE/);
});

test("fallback seed contains a coherent MVP dataset", () => {
  const seed = createMemoryVolumeSeed();
  assert.equal(seed.tenants.length, 1);
  assert.equal(seed.tenants[0]?.id, FALLBACK_TENANT_ID);
  assert.equal(seed.tenants[0]?.publicSlug, FALLBACK_TENANT_SLUG);
  assert.ok(seed.professionals.length >= 2);
  assert.ok(seed.services.length >= 2);
  assert.ok(seed.customers.length >= 2);
  assert.ok(seed.appointments.length >= 3);
  assert.ok(seed.payments.length >= 1);
  assert.ok(seed.leads.length >= 2);
  assert.equal(seed.appointments.every((item) => item.tenantId === FALLBACK_TENANT_ID), true);
});

test("fallback workspace resolves without PostgreSQL", async () => {
  const repository = new MemoryWorkspaceContextRepository();
  const catalog = await repository.listCatalog();
  assert.equal(catalog.tenants.length, 1);
  assert.equal(catalog.tenants[0]?.id, FALLBACK_TENANT_ID);
  assert.deepEqual(catalog.tenants[0]?.roles.map((item) => item.code), ["administrator", "reception", "professional"]);
  assert.equal((await repository.findTenant(FALLBACK_TENANT_ID))?.publicSlug, FALLBACK_TENANT_SLUG);
});
