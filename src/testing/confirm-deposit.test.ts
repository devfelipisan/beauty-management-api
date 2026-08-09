import assert from "node:assert/strict";
import test from "node:test";
import { ConfirmDepositUseCase } from "@/modules/deposits/application/confirm-deposit";
import { createExecutionContext } from "@/shared/application/execution-context";
import type { TransactionContext, UnitOfWork } from "@/shared/application/ports";
import type { AuditEvent } from "@/shared/audit/audit";
import type { Appointment, Deposit } from "@/shared/domain/models";
import type { IdempotencyRecord } from "@/shared/idempotency/idempotency";
import type { OutboxEvent } from "@/shared/outbox/outbox";

test("ConfirmDeposit updates deposit and appointment in one UnitOfWork", async () => {
  const timestamp = "2026-08-09T12:00:00.000Z";
  let appointment: Appointment = {
    id: "appointment-1",
    tenantId: "tenant-1",
    customerId: "customer-1",
    professionalId: "professional-1",
    serviceId: "service-1",
    startsAt: timestamp,
    endsAt: "2026-08-09T12:30:00.000Z",
    status: "awaiting_deposit",
    basePriceCents: 10000,
    discountCents: 0,
    finalPriceCents: 10000,
    depositCents: 2000,
    origin: "reception",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  let deposit: Deposit = {
    id: "deposit-1",
    tenantId: "tenant-1",
    appointmentId: appointment.id,
    amountCents: 2000,
    status: "awaiting_payment",
    createdAt: timestamp,
  };
  let idempotency: IdempotencyRecord | null = null;
  const audits: AuditEvent[] = [];
  const outbox: OutboxEvent[] = [];

  const transaction = {
    appointments: {
      findById: async () => appointment,
      update: async (entity: Appointment) => (appointment = entity),
    },
    deposits: {
      findByAppointmentId: async () => deposit,
      update: async (entity: Deposit) => (deposit = entity),
    },
    audit: {
      append: async (event: AuditEvent) => { audits.push(event); },
    },
    outbox: {
      append: async (event: OutboxEvent) => { outbox.push(event); },
    },
    idempotency: {
      find: async () => idempotency,
      reserve: async (record: IdempotencyRecord) => { idempotency = record; },
      complete: async (_tenantId: string, _operation: string, _key: string, response: unknown) => {
        if (idempotency) idempotency = { ...idempotency, status: "completed", response };
      },
      fail: async () => {
        if (idempotency) idempotency = { ...idempotency, status: "failed" };
      },
    },
  } as unknown as TransactionContext;

  const unitOfWork: UnitOfWork = {
    execute: async (_context, work) => work(transaction),
  };

  const result = await new ConfirmDepositUseCase(unitOfWork).execute(
    createExecutionContext("deposit.confirm", {
      tenantId: "tenant-1",
      actorId: "user-1",
      source: "test",
      requestId: "request-1",
      correlationId: "correlation-1",
    }),
    { appointmentId: "appointment-1", paymentMethod: "pix", idempotencyKey: "idem-key-1" },
  );

  assert.equal(result.status, "confirmed");
  assert.equal(deposit.status, "confirmed");
  assert.equal(deposit.confirmedBy, "user-1");
  assert.equal(appointment.status, "awaiting_confirmation");
  assert.equal(audits.length, 1);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0]?.type, "deposit.confirmed");
  assert.equal(idempotency?.status, "completed");
});
