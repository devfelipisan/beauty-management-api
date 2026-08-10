import assert from "node:assert/strict";
import test from "node:test";
import { createPackage } from "@/modules/packages/domain/package";
import { MemoryPackageRepository } from "@/modules/packages/infrastructure/memory-package-repository";

const tenantId = "tenant-package-test";

test("package creation starts active with zero usage", async () => {
  const item = createPackage({
    tenantId,
    customerId: "customer-a",
    serviceId: "service-a",
    totalSessions: 8,
    priceCents: 72000,
    validUntil: "2027-08-09T00:00:00.000Z",
  });

  assert.equal(item.status, "active");
  assert.equal(item.usedSessions, 0);
  assert.equal(item.totalSessions, 8);
  assert.equal(item.priceCents, 72000);
});

test("package repository scopes records by tenant", async () => {
  const repository = new MemoryPackageRepository();
  const item = createPackage({ tenantId, customerId: "customer-a", serviceId: "service-a", totalSessions: 4 });
  await repository.create(item);

  assert.equal((await repository.list(tenantId)).length, 1);
  assert.equal((await repository.list("other-tenant")).length, 0);
  assert.equal(await repository.findById("other-tenant", item.id), null);
});

test("package validates sessions, price and expiration date", () => {
  assert.throws(() => createPackage({ tenantId, customerId: "customer-a", serviceId: "service-a", totalSessions: 0 }), /between 1 and 1000/);
  assert.throws(() => createPackage({ tenantId, customerId: "customer-a", serviceId: "service-a", totalSessions: 1, priceCents: -1 }), /non-negative/);
  assert.throws(() => createPackage({ tenantId, customerId: "customer-a", serviceId: "service-a", totalSessions: 1, validUntil: "invalid" }), /expiration date is invalid/);
});
