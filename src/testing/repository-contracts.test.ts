import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryRuntime } from "../infrastructure/memory/memory-runtime.ts";
import type { SqlClient, SqlExecutor, SqlQueryResult } from "../infrastructure/postgres/sql-client.ts";
import { PostgresWorkspaceContextRepository } from "../modules/workspace/infrastructure/postgres-workspace-context.repository.ts";
import { createExecutionContext } from "../shared/application/execution-context.ts";

const TENANT_A = "00000000-0000-0000-0000-000000000001";
const TENANT_B = "00000000-0000-0000-0000-000000000002";

function customer(id: string, tenantId: string, phone: string) {
  return {
    id,
    tenantId,
    fullName: `Customer ${id}`,
    phone,
    status: "active" as const,
    relationshipProfile: "new" as const,
    createdAt: "2026-08-09T20:00:00.000Z",
    updatedAt: "2026-08-09T20:00:00.000Z",
  };
}

test("memory repositories enforce tenant-scoped reads without embedded business data", async () => {
  const runtime = createMemoryRuntime();
  const context = createExecutionContext("repository.contract", { tenantId: TENANT_A, source: "test" });
  await runtime.unitOfWork.execute(context, async (tx) => {
    await tx.customers.create(customer("customer-a", TENANT_A, "22999990001"));
    await tx.customers.create(customer("customer-b", TENANT_B, "22999990002"));
  });
  await runtime.unitOfWork.execute(context, async (tx) => {
    const tenantACustomers = await tx.customers.list(TENANT_A);
    const tenantBCustomers = await tx.customers.list(TENANT_B);
    assert.equal(tenantACustomers.length, 1);
    assert.equal(tenantBCustomers.length, 1);
    assert.equal(tenantACustomers.some((item) => item.tenantId !== TENANT_A), false);
    assert.equal(tenantBCustomers.some((item) => item.tenantId !== TENANT_B), false);
  });
});

test("unit of work commits successful mutations atomically", async () => {
  const runtime = createMemoryRuntime();
  const context = createExecutionContext("repository.commit", { tenantId: TENANT_A, source: "test" });
  await runtime.unitOfWork.execute(context, async (tx) => {
    await tx.customers.create(customer("customer-contract", TENANT_A, "22999998888"));
  });
  await runtime.unitOfWork.execute(context, async (tx) => {
    assert.ok(await tx.customers.findById(TENANT_A, "customer-contract"));
  });
});

test("unit of work rolls back failed mutations", async () => {
  const runtime = createMemoryRuntime();
  const context = createExecutionContext("repository.rollback", { tenantId: TENANT_A, source: "test" });
  await assert.rejects(() => runtime.unitOfWork.execute(context, async (tx) => {
    await tx.customers.create(customer("customer-rollback", TENANT_A, "22999997777"));
    throw new Error("force rollback");
  }));
  await runtime.unitOfWork.execute(context, async (tx) => {
    assert.equal(await tx.customers.findById(TENANT_A, "customer-rollback"), null);
  });
});

test("workspace catalog uses one PostgreSQL round trip and reconstructs tenant roles and professionals", async () => {
  const queries: Array<{ text: string; parameters: readonly unknown[] }> = [];
  const rows = [
    {
      tenant_id: TENANT_A,
      display_name: "Bella Estética",
      public_slug: "bella-estetica",
      status: "active",
      role_code: "tenant_admin",
      professional_id: "00000000-0000-0000-0000-000000000101",
      professional_display_name: "Ana Martins",
      professional_specialty: "Laser",
    },
    {
      tenant_id: TENANT_A,
      display_name: "Bella Estética",
      public_slug: "bella-estetica",
      status: "active",
      role_code: "professional",
      professional_id: "00000000-0000-0000-0000-000000000101",
      professional_display_name: "Ana Martins",
      professional_specialty: "Laser",
    },
    {
      tenant_id: TENANT_A,
      display_name: "Bella Estética",
      public_slug: "bella-estetica",
      status: "active",
      role_code: "reception",
      professional_id: "00000000-0000-0000-0000-000000000102",
      professional_display_name: "Julia Alves",
      professional_specialty: "Facial",
    },
  ];

  const sql: SqlClient = {
    async query<TRow>(text: string, parameters: readonly unknown[] = []): Promise<SqlQueryResult<TRow>> {
      queries.push({ text, parameters });
      return { rows: rows as unknown as TRow[], rowCount: rows.length };
    },
    async transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
      return work(this);
    },
  };

  const repository = new PostgresWorkspaceContextRepository(sql);
  const catalog = await repository.listCatalog();

  assert.equal(queries.length, 1);
  assert.match(queries[0].text, /left join identity\.roles/i);
  assert.match(queries[0].text, /left join app\.professionals/i);
  assert.equal(catalog.tenants.length, 1);
  assert.deepEqual(catalog.tenants[0].roles.map((role) => role.code).sort(), ["administrator", "professional", "reception"]);
  const professionalRole = catalog.tenants[0].roles.find((role) => role.code === "professional");
  assert.equal(professionalRole?.professionals?.length, 2);
});

test("workspace tenant lookup uses one PostgreSQL round trip", async () => {
  let queryCount = 0;
  const sql: SqlClient = {
    async query<TRow>(): Promise<SqlQueryResult<TRow>> {
      queryCount += 1;
      const rows = [{
        tenant_id: TENANT_A,
        display_name: "Bella Estética",
        public_slug: "bella-estetica",
        status: "active",
        role_code: "reception",
        professional_id: null,
        professional_display_name: null,
        professional_specialty: null,
      }];
      return { rows: rows as unknown as TRow[], rowCount: rows.length };
    },
    async transaction<T>(work: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
      return work(this);
    },
  };

  const repository = new PostgresWorkspaceContextRepository(sql);
  const tenant = await repository.findTenant(TENANT_A);

  assert.equal(queryCount, 1);
  assert.equal(tenant?.id, TENANT_A);
  assert.equal(tenant?.roles[0]?.code, "reception");
});
