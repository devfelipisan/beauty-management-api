import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryContextSeed } from "@/infrastructure/memory/memory-context-seed";
import { createMemoryVolumeSeed } from "@/infrastructure/memory/memory-volume-seed";

const expectedAppointmentStatuses = new Set([
  "awaiting_deposit",
  "awaiting_confirmation",
  "confirmed",
  "checked_in",
  "in_progress",
  "completed",
  "rescheduled",
  "canceled",
  "no_show",
  "expired",
]);

const expectedDepositStatuses = new Set([
  "not_required",
  "awaiting_payment",
  "proof_submitted",
  "under_review",
  "confirmed",
  "rejected",
  "expired",
  "refunded",
  "retained",
  "credit",
]);

test("memory volume seed has the expected scale and lifecycle coverage", () => {
  const seed = createMemoryVolumeSeed();

  assert.equal(seed.tenants.length, 4);
  assert.equal(seed.professionals.length, 24);
  assert.equal(seed.services.length, 45);
  assert.equal(seed.customers.length, 1_500);
  assert.equal(seed.appointments.length, 8_000);
  assert.equal(seed.deposits.length, 5_000);
  assert.ok(seed.sessions.length > 1_000);
  assert.equal(seed.payments.length, 6_500);
  assert.equal(seed.leads.length, 1_200);
  assert.equal(seed.audit.length, 30_000);
  assert.equal(seed.outbox.length, 12_000);
  assert.equal(seed.idempotency.length, 8_000);

  assert.deepEqual(new Set(seed.appointments.map((item) => item.status)), expectedAppointmentStatuses);
  assert.deepEqual(new Set(seed.deposits.map((item) => item.status)), expectedDepositStatuses);
  assert.deepEqual(new Set(seed.customers.map((item) => item.relationshipProfile)), new Set(["new", "returning", "loyal", "inactive", "frequent_no_show"]));
  assert.deepEqual(new Set(seed.payments.map((item) => item.status)), new Set(["pending", "partial", "paid", "refunded", "canceled"]));
  assert.deepEqual(new Set(seed.leads.map((item) => item.status)), new Set(["new", "in_contact", "awaiting_customer", "appointment_created", "converted", "no_response", "lost", "duplicate"]));
});

test("extracted memory contexts are seeded with realistic volume", () => {
  const seed = createMemoryContextSeed();

  assert.equal(seed.equipment.length, 18);
  assert.equal(seed.packages.length, 700);
  assert.equal(seed.assessments.length, 950);
  assert.equal(seed.technicalRecords.length, 12_000);
  assert.equal(seed.followUps.length, 2_000);
  assert.equal(seed.landingPages.length, 4);

  assert.deepEqual(new Set(seed.equipment.map((item) => item.status)), new Set(["available", "maintenance", "blocked", "inactive"]));
  assert.deepEqual(new Set(seed.packages.map((item) => item.status)), new Set(["active", "expired", "exhausted", "canceled"]));
  assert.deepEqual(new Set(seed.assessments.map((item) => item.result)), new Set(["fit", "fit_with_restrictions", "not_fit"]));
  assert.deepEqual(new Set(seed.followUps.map((item) => item.status)), new Set(["pending", "scheduled", "completed", "canceled"]));
  assert.deepEqual(new Set(seed.landingPages.map((item) => item.status)), new Set(["published", "draft", "hidden"]));
});

test("memory volume seed preserves tenant ownership and references", () => {
  const seed = createMemoryVolumeSeed();
  const tenants = new Set(seed.tenants.map((item) => item.id));
  const customers = new Map(seed.customers.map((item) => [item.id, item]));
  const professionals = new Map(seed.professionals.map((item) => [item.id, item]));
  const services = new Map(seed.services.map((item) => [item.id, item]));
  const appointments = new Map(seed.appointments.map((item) => [item.id, item]));

  for (const appointment of seed.appointments) {
    assert.ok(tenants.has(appointment.tenantId));
    assert.equal(customers.get(appointment.customerId)?.tenantId, appointment.tenantId);
    assert.equal(professionals.get(appointment.professionalId)?.tenantId, appointment.tenantId);
    assert.equal(services.get(appointment.serviceId)?.tenantId, appointment.tenantId);
    assert.ok(appointment.endsAt > appointment.startsAt);
    assert.equal(appointment.finalPriceCents, appointment.basePriceCents - appointment.discountCents);
    assert.ok(appointment.depositCents <= appointment.finalPriceCents);
  }

  for (const deposit of seed.deposits) {
    assert.equal(appointments.get(deposit.appointmentId)?.tenantId, deposit.tenantId);
  }

  for (const session of seed.sessions) {
    const appointment = appointments.get(session.appointmentId);
    assert.equal(appointment?.tenantId, session.tenantId);
    assert.equal(appointment?.customerId, session.customerId);
    assert.equal(appointment?.professionalId, session.professionalId);
    assert.equal(appointment?.serviceId, session.serviceId);
  }
});

test("professional agenda data is partitioned inside each tenant", () => {
  const seed = createMemoryVolumeSeed();
  const bellaAppointments = seed.appointments.filter((item) => item.tenantId === "tenant-bella");
  const professionals = new Set(bellaAppointments.map((item) => item.professionalId));

  assert.ok(professionals.size > 1);
  for (const professionalId of professionals) {
    const own = bellaAppointments.filter((item) => item.professionalId === professionalId);
    assert.ok(own.length > 0);
    assert.ok(own.every((item) => item.professionalId === professionalId));
  }
});

test("memory volume seed is deterministic", () => {
  const first = createMemoryVolumeSeed();
  const second = createMemoryVolumeSeed();
  const firstContexts = createMemoryContextSeed();
  const secondContexts = createMemoryContextSeed();

  assert.deepEqual(first.tenants, second.tenants);
  assert.deepEqual(first.appointments.slice(0, 100), second.appointments.slice(0, 100));
  assert.deepEqual(first.audit.slice(-100), second.audit.slice(-100));
  assert.deepEqual(firstContexts.equipment, secondContexts.equipment);
  assert.deepEqual(firstContexts.landingPages, secondContexts.landingPages);
});
