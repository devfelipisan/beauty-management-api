import type { ExecutionContext } from "@/shared/application/execution-context";
import { nowIso, NotFoundError } from "@/shared/domain/core";
import type { Lead } from "../domain/lead";
import type { LeadRepository } from "../domain/lead-repository";
import { transitionLead, type LeadAction } from "../domain/lead-state-machine";

export interface UpdateLeadStatusInput {
  leadId: string;
  action: LeadAction;
}

export class UpdateLeadStatusUseCase {
  constructor(private readonly leads: LeadRepository) {}

  async execute(context: ExecutionContext, input: UpdateLeadStatusInput): Promise<Lead> {
    if (!context.tenantId) throw new Error("Tenant is required to update a lead lifecycle.");
    const lead = await this.leads.findById(context.tenantId, input.leadId);
    if (!lead) throw new NotFoundError("lead", input.leadId);
    const updated: Lead = { ...lead, status: transitionLead(lead.status, input.action), updatedAt: nowIso() };
    return this.leads.update(updated);
  }
}
