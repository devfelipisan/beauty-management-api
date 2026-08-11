import assert from "node:assert/strict";
import test from "node:test";
import { parseBusinessCommandInput } from "../api/contracts.ts";
import { readAuthenticationPolicy } from "../config/authentication-policy.ts";
import { createMemoryRuntime } from "../infrastructure/memory/memory-runtime.ts";
import {
  ResolveOperationalTenantContextUseCase,
  type OperationalTenantContext,
  type OperationalTenantContextRepository,
} from "../modules/tenants/application/resolve-operational-tenant-context.ts";
import { AuthorizationError, AuthorizationService, type AccessControlRepository, type TenantAccess } from "../server/auth/authorization.ts";
import { Permissions } from "../server/auth/permissions.ts";
import { ContractValidationError } from "../shared/contracts/runtime-schema.ts";
import { DomainError } from "../shared/domain/core.ts";

const TEST_TENANT = "00000000-0000-0000-0000-000000000001";
const OTHER_TENANT = "00000000-0000-0000-0000-000000000002";

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

test("authentication gate is disabled by default and can be explicitly enabled", () => {
  assert.equal(readAuthenticationPolicy({} as NodeJS.ProcessEnv).enabled, false);
  assert.equal(readAuthenticationPolicy({ AUTHENTICATION_ENABLED: "true" } as NodeJS.ProcessEnv).enabled, true);
  assert.equal(readAuthenticationPolicy({ AUTHENTICATION_ENABLED: "false" } as NodeJS.ProcessEnv).enabled, false);
  assert.throws(() => readAuthenticationPolicy({ AUTHENTICATION_ENABLED: "invalid" } as NodeJS.ProcessEnv));
});

test("operational tenant context is always resolved through its repository", async () => {
  const tenant = (id: string, status: OperationalTenantContext["status"] = "active"): OperationalTenantContext => ({
    tenantId: id,
    displayName: id,
    status,
  });
  const tenants = [tenant(TEST_TENANT), tenant(OTHER_TENANT)];
  const repository: OperationalTenantContextRepository = {
    findById: async (tenantId) => tenants.find((item) => item.tenantId === tenantId) ?? null,
    listOperational: async () => tenants.filter((item) => item.status === "active" || item.status === "trial"),
  };
  const resolver = new ResolveOperationalTenantContextUseCase(repository);

  assert.equal((await resolver.execute(TEST_TENANT)).tenantId, TEST_TENANT);
  await assert.rejects(
    () => resolver.execute(),
    (error) => error instanceof DomainError && error.code === "TENANT_SELECTION_REQUIRED",
  );
  await assert.rejects(
    () => resolver.execute("tenant-bella"),
    (error) => error instanceof DomainError && error.code === "TENANT_SELECTION_INVALID",
  );
});

test("tenant membership and RBAC authorize only a database-resolved tenant context", async () => {
  const runtime = createMemoryRuntime();
  const authorization = new AuthorizationService(runtime.accessControl);
  const admin = await authorization.requireTenantPermission("user-tenant-admin", TEST_TENANT, Permissions.AuditRead);
  assert.equal(admin.actorId, "user-tenant-admin");
  assert.equal(admin.tenantId, TEST_TENANT);
  assert.ok(admin.roles.includes("tenant_admin"));

  const automatic = await authorization.resolveTenantContext("user-tenant-admin");
  assert.equal(automatic.tenantId, TEST_TENANT);

  await assert.rejects(
    () => authorization.requireTenantPermission("user-reception", TEST_TENANT, Permissions.AuditRead),
    (error) => error instanceof AuthorizationError && error.code === "PERMISSION_REQUIRED",
  );
  await assert.rejects(
    () => authorization.requireTenantPermission("user-tenant-admin", OTHER_TENANT, Permissions.CustomerRead),
    (error) => error instanceof AuthorizationError && error.code === "TENANT_MEMBERSHIP_REQUIRED",
  );
  await assert.rejects(
    () => authorization.requireTenantPermission("user-tenant-admin", "tenant-bella", Permissions.CustomerRead),
    (error) => error instanceof DomainError && error.code === "TENANT_SELECTION_INVALID",
  );
});

test("professional role receives own-scope permissions and resolved professional identity", async () => {
  const runtime = createMemoryRuntime();
  const authorization = new AuthorizationService(runtime.accessControl);
  const access = await authorization.requireResolvedTenantPermission("user-professional", undefined, Permissions.AppointmentReadOwn);
  assert.ok(access.professionalId);
  assert.equal(access.permissions.includes(Permissions.AppointmentRead), false);
  assert.equal(access.permissions.includes(Permissions.CustomerRead), false);
});

test("multiple active tenant memberships require an explicit selector", async () => {
  const base = (tenantId: string): TenantAccess => ({
    actorId: "actor",
    authSubject: "subject",
    tenantId,
    tenantDisplayName: tenantId,
    tenantStatus: "active",
    membershipId: `membership:${tenantId}`,
    membershipStatus: "active",
    roles: ["tenant_admin"],
    permissions: [Permissions.TenantRead],
  });
  const accesses = [base(TEST_TENANT), base(OTHER_TENANT)];
  const repository: AccessControlRepository = {
    listTenantAccesses: async () => accesses,
    resolveTenantAccess: async (_subject, tenantId) => accesses.find((access) => access.tenantId === tenantId) ?? null,
    resolvePlatformAccess: async () => null,
  };
  const authorization = new AuthorizationService(repository);

  await assert.rejects(
    () => authorization.resolveTenantContext("subject"),
    (error) => error instanceof DomainError && error.code === "TENANT_SELECTION_REQUIRED",
  );
  assert.equal((await authorization.resolveTenantContext("subject", OTHER_TENANT)).tenantId, OTHER_TENANT);
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
