import assert from "node:assert/strict";
import test from "node:test";
import { allowedAppointmentActions, transitionAppointment } from "../modules/appointments/domain/appointment-state-machine.ts";
import { depositStateMachine } from "../modules/deposits/domain/deposit-state-machine.ts";
import { sessionStateMachine } from "../modules/sessions/domain/session-state-machine.ts";

test("appointment follows the main operational flow", () => {
  assert.equal(transitionAppointment("awaiting_deposit", "deposit_confirmed"), "awaiting_confirmation");
  assert.equal(transitionAppointment("awaiting_confirmation", "confirm_presence"), "confirmed");
  assert.equal(transitionAppointment("confirmed", "check_in"), "checked_in");
  assert.equal(transitionAppointment("checked_in", "start_session"), "in_progress");
  assert.equal(transitionAppointment("in_progress", "complete"), "completed");
});

test("terminal appointment states reject new transitions", () => {
  assert.deepEqual(allowedAppointmentActions("completed"), []);
  assert.throws(() => transitionAppointment("completed", "cancel"), /cannot execute cancel/);
});

test("deposit confirmation is owned by the deposit bounded context", () => {
  assert.equal(depositStateMachine.transition("awaiting_payment", "confirm"), "confirmed");
  assert.equal(depositStateMachine.transition("proof_submitted", "confirm"), "confirmed");
  assert.equal(depositStateMachine.transition("under_review", "confirm"), "confirmed");
  assert.throws(() => depositStateMachine.transition("expired", "confirm"), /Deposit cannot execute confirm/);
});

test("session completion is independent from appointment transitions", () => {
  assert.equal(sessionStateMachine.transition("in_progress", "complete"), "completed");
  assert.deepEqual(sessionStateMachine.allowedActions("completed"), []);
  assert.throws(() => sessionStateMachine.transition("completed", "complete"), /Session cannot execute complete/);
});
