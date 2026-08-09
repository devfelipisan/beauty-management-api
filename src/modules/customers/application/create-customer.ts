import type { ExecutionContext } from "@/shared/application/execution-context";
import type { UnitOfWork } from "@/shared/application/ports";
import { AuditActions, createAuditEvent } from "@/shared/audit/audit";
import { ConflictError, createEntityId, nowIso } from "@/shared/domain/core";
import type { Customer } from "@/shared/domain/models";
import { createOutboxEvent } from "@/shared/outbox/outbox";

export interface CreateCustomerInput {
  fullName: string;
  phone: string;
  email?: string;
}

export class CreateCustomerUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async execute(context: ExecutionContext, input: CreateCustomerInput): Promise<Customer> {
    if (!context.tenantId) throw new Error("Tenant is required to create a customer.");
    const tenantId = context.tenantId;
    const fullName = input.fullName.trim();
    const phone = input.phone.trim();
    const email = input.email?.trim().toLowerCase() || undefined;
    if (fullName.length < 2 || phone.length < 8) throw new Error("Customer name and phone are required.");

    return this.unitOfWork.execute(context, async (transaction) => {
      const duplicates = await transaction.customers.findDuplicates(tenantId, { fullName, phone, email });
      if (duplicates.some((item) => item.phone === phone || (email && item.email === email))) {
        throw new ConflictError("CUSTOMER_DUPLICATE", "A customer with the same phone or e-mail already exists.");
      }

      const timestamp = nowIso();
      const customer: Customer = {
        id: createEntityId(),
        tenantId,
        fullName,
        phone,
        email,
        status: "active",
        relationshipProfile: "new",
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await transaction.customers.create(customer);
      await transaction.audit.append(createAuditEvent(context, {
        action: AuditActions.CustomerCreated,
        resource: { type: "customer", id: customer.id },
        metadata: { profile: customer.relationshipProfile },
      }));
      await transaction.outbox.append(createOutboxEvent({
        tenantId,
        type: "customer.created",
        aggregateType: "customer",
        aggregateId: customer.id,
        correlationId: context.correlationId,
        payload: { customerId: customer.id },
      }));
      return customer;
    });
  }
}
