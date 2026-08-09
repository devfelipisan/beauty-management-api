import assert from "node:assert/strict";
import test from "node:test";
import { createExecutionContext } from "@/shared/application/execution-context";
import { AuditActions, createAuditEvent } from "@/shared/audit/audit";
import { stableRequestHash } from "@/shared/idempotency/idempotency";
import { createOutboxEvent } from "@/shared/outbox/outbox";

test("request hash is stable for equivalent object key ordering", () => {
  assert.equal(
    stableRequestHash({ tenantId: "tenant-a", payload: { b: 2, a: 1 } }),
    stableRequestHash({ payload: { a: 1, b: 2 }, tenantId: "tenant-a" }),
  );
});

test("audit event inherits trusted execution context", () => {
  const context = createExecutionContext("appointment.create", {
    requestId: "request-1",
    correlationId: "correlation-1",
    tenantId: "tenant-a",
    actorId: "user-a",
    source: "test",
  });

  const event = createAuditEvent(context, {
    action: AuditActions.AppointmentCreated,
    resource: { type: "appointment", id: "appointment-a" },
  });

  assert.equal(event.tenantId, "tenant-a");
  assert.equal(event.actor.id, "user-a");
  assert.equal(event.requestId, "request-1");
  assert.equal(event.correlationId, "correlation-1");
});

test("outbox events start pending and unattempted", () => {
  const event = createOutboxEvent({
    tenantId: "tenant-a",
    type: "appointment.created",
    aggregateType: "appointment",
    aggregateId: "appointment-a",
    correlationId: "correlation-1",
    payload: { appointmentId: "appointment-a" },
  });

  assert.equal(event.status, "pending");
  assert.equal(event.attempts, 0);
  assert.equal(event.tenantId, "tenant-a");
});
