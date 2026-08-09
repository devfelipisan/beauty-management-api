import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryRuntime } from "../infrastructure/memory/memory-runtime.ts";
import { createExecutionContext } from "../shared/application/execution-context.ts";

test("memory repositories enforce tenant-scoped reads", async () => {
  const runtime = createMemoryRuntime();
  const context = createExecutionContext("repository.contract", { tenantId: "tenant-bella", source: "test" });
  await runtime.unitOfWork.execute(context, async (tx) => {
    const bellaCustomers = await tx.customers.list("tenant-bella");
    const inkCustomers = await tx.customers.list("tenant-ink");
    assert.ok(bellaCustomers.length > 0);
    assert.ok(inkCustomers.length > 0);
    assert.equal(bellaCustomers.some((customer) => customer.tenantId !== "tenant-bella"), false);
    assert.equal(inkCustomers.some((customer) => customer.tenantId !== "tenant-ink"), false);
  });
});

test("unit of work commits successful mutations atomically", async () => {
  const runtime = createMemoryRuntime();
  const context = createExecutionContext("repository.commit", { tenantId: "tenant-bella", source: "test" });
  await runtime.unitOfWork.execute(context, async (tx) => {
    await tx.customers.create({
      id: "customer-contract",
      tenantId: "tenant-bella",
      fullName: "Contract Customer",
      phone: "22999998888",
      status: "active",
      relationshipProfile: "new",
      createdAt: "2026-08-09T20:00:00.000Z",
      updatedAt: "2026-08-09T20:00:00.000Z",
    });
  });
  await runtime.unitOfWork.execute(context, async (tx) => {
    assert.ok(await tx.customers.findById("tenant-bella", "customer-contract"));
  });
});

test("unit of work rolls back failed mutations", async () => {
  const runtime = createMemoryRuntime();
  const context = createExecutionContext("repository.rollback", { tenantId: "tenant-bella", source: "test" });
  await assert.rejects(() => runtime.unitOfWork.execute(context, async (tx) => {
    await tx.customers.create({
      id: "customer-rollback",
      tenantId: "tenant-bella",
      fullName: "Rollback Customer",
      phone: "22999997777",
      status: "active",
      relationshipProfile: "new",
      createdAt: "2026-08-09T20:00:00.000Z",
      updatedAt: "2026-08-09T20:00:00.000Z",
    });
    throw new Error("force rollback");
  }));
  await runtime.unitOfWork.execute(context, async (tx) => {
    assert.equal(await tx.customers.findById("tenant-bella", "customer-rollback"), null);
  });
});
