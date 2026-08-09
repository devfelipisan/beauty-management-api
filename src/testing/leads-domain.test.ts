import assert from "node:assert/strict";
import test from "node:test";
import { CreatePublicLeadUseCase } from "../modules/leads/application/create-public-lead.ts";
import { UpdateLeadStatusUseCase } from "../modules/leads/application/update-lead-status.ts";
import type { Lead } from "../modules/leads/domain/lead.ts";
import type { LeadRepository } from "../modules/leads/domain/lead-repository.ts";
import { allowedLeadActions, transitionLead } from "../modules/leads/domain/lead-state-machine.ts";
import { createExecutionContext } from "../shared/application/execution-context.ts";

class FakeLeadRepository implements LeadRepository {
  readonly items: Lead[] = [];
  async findById(tenantId: string, id: string) { return this.items.find((item) => item.tenantId === tenantId && item.id === id) ?? null; }
  async findPotentialDuplicates(tenantId: string, input: Pick<Lead, "phone" | "email">) {
    return this.items.filter((item) => item.tenantId === tenantId && ((input.phone && item.phone === input.phone) || (input.email && item.email === input.email)));
  }
  async list(tenantId: string) { return this.items.filter((item) => item.tenantId === tenantId); }
  async create(entity: Lead) { this.items.push(structuredClone(entity)); return structuredClone(entity); }
  async update(entity: Lead) {
    const index = this.items.findIndex((item) => item.tenantId === entity.tenantId && item.id === entity.id);
    if (index >= 0) this.items[index] = structuredClone(entity);
    return structuredClone(entity);
  }
}

test("public newsletter creates only a lead with marketing consent", async () => {
  const repository = new FakeLeadRepository();
  const useCase = new CreatePublicLeadUseCase(repository);
  const lead = await useCase.execute({ tenantId: "tenant-1" }, {
    fullName: "Maria Silva",
    email: "MARIA@example.com",
    origin: "landing_newsletter",
    privacyConsent: true,
    marketingConsent: true,
  });
  assert.equal(repository.items.length, 1);
  assert.equal(lead.status, "new");
  assert.equal(lead.email, "maria@example.com");
  assert.ok(lead.privacyConsentAt);
  assert.ok(lead.marketingConsentAt);
  assert.equal(lead.customerId, undefined);
  assert.equal(lead.appointmentId, undefined);
});

test("newsletter rejects missing marketing consent", async () => {
  const useCase = new CreatePublicLeadUseCase(new FakeLeadRepository());
  await assert.rejects(() => useCase.execute({ tenantId: "tenant-1" }, {
    fullName: "Maria Silva",
    email: "maria@example.com",
    origin: "landing_newsletter",
    privacyConsent: true,
    marketingConsent: false,
  }), (error: unknown) => error instanceof Error && "code" in error && error.code === "LEAD_MARKETING_CONSENT_REQUIRED");
});

test("public lead requires at least one contact channel", async () => {
  const useCase = new CreatePublicLeadUseCase(new FakeLeadRepository());
  await assert.rejects(() => useCase.execute({ tenantId: "tenant-1" }, {
    fullName: "Maria Silva",
    origin: "landing_contact",
    privacyConsent: true,
    marketingConsent: false,
  }), (error: unknown) => error instanceof Error && "code" in error && error.code === "LEAD_CONTACT_REQUIRED");
});

test("lead state machine exposes only allowed lifecycle actions", () => {
  assert.deepEqual(allowedLeadActions("new").sort(), ["lose", "mark_duplicate", "start_contact"].sort());
  assert.equal(transitionLead("new", "start_contact"), "in_contact");
  assert.equal(transitionLead("in_contact", "await_customer"), "awaiting_customer");
  assert.equal(transitionLead("awaiting_customer", "mark_no_response"), "no_response");
  assert.equal(transitionLead("no_response", "resume_contact"), "in_contact");
});

test("terminal and conversion-owned lead statuses reject generic lifecycle changes", () => {
  for (const status of ["appointment_created", "converted", "lost", "duplicate"] as const) {
    assert.deepEqual(allowedLeadActions(status), []);
    assert.throws(() => transitionLead(status, "start_contact"), (error: unknown) => error instanceof Error && "code" in error && error.code === "LEAD_TRANSITION_NOT_ALLOWED");
  }
});

test("update lead status persists a valid transition without creating customer or appointment", async () => {
  const repository = new FakeLeadRepository();
  const createLead = new CreatePublicLeadUseCase(repository);
  const updateStatus = new UpdateLeadStatusUseCase(repository);
  const lead = await createLead.execute({ tenantId: "tenant-1" }, {
    fullName: "Maria Silva",
    phone: "22999990000",
    origin: "landing_contact",
    privacyConsent: true,
    marketingConsent: false,
  });

  const context = createExecutionContext("lead.lifecycle.test", { tenantId: "tenant-1", source: "test" });
  const updated = await updateStatus.execute(context, { leadId: lead.id, action: "start_contact" });
  assert.equal(updated.status, "in_contact");
  assert.equal(updated.customerId, undefined);
  assert.equal(updated.appointmentId, undefined);
});
