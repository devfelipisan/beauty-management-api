import assert from "node:assert/strict";
import test from "node:test";
import { parseBusinessCommandInput } from "../api/contracts.ts";
import { AuthorizationError, AuthorizationService } from "../server/auth/authorization.ts";
import { Permissions } from "../server/auth/permissions.ts";
import { ContractValidationError } from "../shared/contracts/runtime-schema.ts";
import { createMemoryRuntime } from "../infrastructure/memory/memory-runtime.ts";

test("runtime DTO validation rejects missing required fields and unexpected properties", () => {
  assert.throws(
    () => parseBusinessCommandInput("customer.create", { fullName: "Maria" }),
    (error) => error instanceof ContractValidationError && error.issues.some((issue) => issue.path === "$.phone"),
  );
  assert.throws(
    () => parseBusinessCommandInput("customer.create", { fullName: "Maria", phone: "22999999999", admin: true }),
    (error) => error instanceof ContractValidationError && error.issues.some((issue) => issue.message.includes("Unexpected fields")),
  );
});

test("runtime DTO validation normalizes trimmed strings", () => {
  const parsed = parseBusinessCommandInput("customer.create", { fullName: "  Maria Silva  ", phone: " 22999999999 " }) as { fullName: string; phone: string };
  assert.equal(parsed.fullName, "Maria Silva");
  assert.equal(parsed.phone, "22999999999");
});

test("tenant membership and RBAC authorize the backend memory membership", async () => {
  const runtime = createMemoryRuntime();
  const authorization = new AuthorizationService(runtime.accessControl);
  const admin = await authorization.requireTenantPermission("user-tenant-admin", "tenant-bella", Permissions.AuditRead);
  assert.equal(admin.actorId, "user-tenant-admin");
  assert.ok(admin.roles.includes("tenant_admin"));

  await assert.rejects(
    () => authorization.requireTenantPermission("user-reception", "tenant-bella", Permissions.AuditRead),
    (error) => error instanceof AuthorizationError && error.code === "PERMISSION_REQUIRED",
  );
  await assert.rejects(
    () => authorization.requireTenantPermission("user-tenant-admin", "tenant-ink", Permissions.CustomerRead),
    (error) => error instanceof AuthorizationError && error.code === "TENANT_MEMBERSHIP_REQUIRED",
  );
});

test("platform authorization is separate from tenant membership", async () => {
  const runtime = createMemoryRuntime();
  const authorization = new AuthorizationService(runtime.accessControl);
  const access = await authorization.requirePlatformPermission("user-platform-admin", Permissions.PlatformTenantCreate);
  assert.equal(access.actorId, "user-platform-admin");
  await assert.rejects(
    () => authorization.requirePlatformPermission("user-tenant-admin", Permissions.PlatformTenantCreate),
    (error) => error instanceof AuthorizationError && error.code === "PLATFORM_PERMISSION_REQUIRED",
  );
});
