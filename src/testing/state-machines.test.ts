import assert from "node:assert/strict";
import test from "node:test";
import { allowedAppointmentActions, transitionAppointment } from "@/modules/appointments/domain/appointment-state-machine";
import { depositStateMachine } from "@/modules/deposits/domain/deposit-state-machine";
import { allowedLeadActions, transitionLead } from "@/modules/leads/domain/lead-state-machine";
import { sessionStateMachine } from "@/modules/sessions/domain/session-state-machine";
import { normalizePublicTenantSlug } from "@/modules/tenants/domain/public-tenant-slug";

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

test("session completion remains independent from appointment transitions", () => {
  assert.equal(sessionStateMachine.transition("in_progress", "complete"), "completed");
  assert.deepEqual(sessionStateMachine.allowedActions("completed"), []);
});

test("lead transitions preserve the current acquisition lifecycle", () => {
  assert.equal(transitionLead("new", "start_contact"), "in_contact");
  assert.equal(transitionLead("in_contact", "await_customer"), "awaiting_customer");
  assert.equal(transitionLead("awaiting_customer", "resume_contact"), "in_contact");
  assert.deepEqual(allowedLeadActions("converted"), []);
});

test("public tenant slug normalization remains deterministic", () => {
  assert.equal(normalizePublicTenantSlug(" Clínica Bella Estética "), "clinica-bella-estetica");
});
