import type { Lead } from "@/modules/leads/domain/lead";
import type { Customer } from "@/shared/domain/models";
import type { ExecutionContext } from "@/shared/application/execution-context";

export interface LeadConversionTransaction {
  findLeadById(tenantId: string, leadId: string): Promise<Lead | null>;
  findCustomerById(tenantId: string, customerId: string): Promise<Customer | null>;
  findCustomerDuplicates(tenantId: string, input: Pick<Customer, "fullName" | "phone" | "email">): Promise<Customer[]>;
  createCustomer(customer: Customer): Promise<Customer>;
  updateLead(lead: Lead): Promise<Lead>;
}

export interface LeadConversionUnitOfWork {
  execute<T>(context: ExecutionContext, work: (transaction: LeadConversionTransaction) => Promise<T>): Promise<T>;
}
