import { DomainError } from "@/shared/domain/core";
import type { LeadStatus } from "./lead";

export type LeadAction =
  | "start_contact"
  | "await_customer"
  | "resume_contact"
  | "mark_no_response"
  | "lose"
  | "mark_duplicate";

const transitions: Record<LeadStatus, Partial<Record<LeadAction, LeadStatus>>> = {
  new: {
    start_contact: "in_contact",
    lose: "lost",
    mark_duplicate: "duplicate",
  },
  in_contact: {
    await_customer: "awaiting_customer",
    mark_no_response: "no_response",
    lose: "lost",
    mark_duplicate: "duplicate",
  },
  awaiting_customer: {
    resume_contact: "in_contact",
    mark_no_response: "no_response",
    lose: "lost",
    mark_duplicate: "duplicate",
  },
  no_response: {
    resume_contact: "in_contact",
    lose: "lost",
    mark_duplicate: "duplicate",
  },
  appointment_created: {},
  converted: {},
  lost: {},
  duplicate: {},
};

export function allowedLeadActions(status: LeadStatus): LeadAction[] {
  return Object.keys(transitions[status]) as LeadAction[];
}

export function transitionLead(status: LeadStatus, action: LeadAction): LeadStatus {
  const next = transitions[status][action];
  if (!next) {
    throw new DomainError(
      "LEAD_TRANSITION_NOT_ALLOWED",
      `Lead action ${action} is not allowed from status ${status}.`,
      { status, action, allowedActions: allowedLeadActions(status) },
    );
  }
  return next;
}
