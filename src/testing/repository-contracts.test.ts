import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryRuntime } from "../infrastructure/memory/memory-runtime.ts";
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
