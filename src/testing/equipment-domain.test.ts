import assert from "node:assert/strict";
import test from "node:test";
import { createEquipment } from "@/modules/equipment/domain/equipment";
import { MemoryEquipmentRepository } from "@/modules/equipment/infrastructure/memory-equipment-repository";

const tenantId = "tenant-equipment-test";

test("equipment creation normalizes optional data and starts available", async () => {
  const equipment = createEquipment({
    tenantId,
    name: "  Laser Alexandrite  ",
    model: "  X1  ",
    manufacturer: "  Acme  ",
    serialNumber: "  SN-123  ",
    primaryUnit: "  J/cm²  ",
    serviceIds: ["service-a", "service-a", "service-b"],
    notes: "  Sala principal  ",
  });

  assert.equal(equipment.name, "Laser Alexandrite");
  assert.equal(equipment.status, "available");
  assert.equal(equipment.usageCount, 0);
  assert.deepEqual(equipment.serviceIds, ["service-a", "service-b"]);
  assert.equal(equipment.serialNumber, "SN-123");
});

test("equipment repository enforces tenant-scoped reads", async () => {
  const repository = new MemoryEquipmentRepository();
  const equipment = createEquipment({ tenantId, name: "Laser A", serviceIds: [] });
  await repository.create(equipment);

  assert.equal((await repository.findById(tenantId, equipment.id))?.id, equipment.id);
  assert.equal(await repository.findById("other-tenant", equipment.id), null);
  assert.equal((await repository.list(tenantId)).length, 1);
  assert.equal((await repository.list("other-tenant")).length, 0);
});

test("equipment requires tenant and valid name", () => {
  assert.throws(() => createEquipment({ tenantId: "", name: "Laser" }), /Tenant is required/);
  assert.throws(() => createEquipment({ tenantId, name: "x" }), /at least 2 characters/);
});
