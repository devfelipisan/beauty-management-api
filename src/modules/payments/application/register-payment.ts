import type { ExecutionContext } from "@/shared/application/execution-context";
import { executeIdempotent } from "@/shared/application/idempotent-command";
import type { UnitOfWork } from "@/shared/application/ports";
import { AuditActions, createAuditEvent } from "@/shared/audit/audit";
import { NotFoundError, assertMoneyCents, createEntityId, nowIso } from "@/shared/domain/core";
import type { Payment } from "@/shared/domain/models";
import { createOutboxEvent } from "@/shared/outbox/outbox";

export interface RegisterPaymentInput {
  customerId: string;
  originType: Payment["originType"];
  originId: string;
  amountCents: number;
  method: Payment["method"];
  idempotencyKey: string;
}

export class RegisterPaymentUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async execute(context: ExecutionContext, input: RegisterPaymentInput): Promise<Payment> {
    if (!context.tenantId) throw new Error("Tenant is required to register a payment.");
    const tenantId = context.tenantId;
    const amountCents = assertMoneyCents(input.amountCents, "amountCents");
    return executeIdempotent({
      unitOfWork: this.unitOfWork,
      context,
      operation: "RegisterPayment",
      key: input.idempotencyKey,
      input,
      handler: async (transaction) => {
        const customer = await transaction.customers.findById(tenantId, input.customerId);
        if (!customer) throw new NotFoundError("customer", input.customerId);
        const payment: Payment = {
          id: createEntityId(), tenantId, customerId: input.customerId, originType: input.originType,
          originId: input.originId, amountCents, method: input.method, status: "paid",
          paidAt: nowIso(), createdAt: nowIso(),
        };
        await transaction.payments.create(payment);
        await transaction.audit.append(createAuditEvent(context, {
          action: AuditActions.PaymentRegistered,
          resource: { type: "payment", id: payment.id },
          metadata: { customerId: payment.customerId, originType: payment.originType, originId: payment.originId, amountCents: payment.amountCents, method: payment.method },
        }));
        await transaction.outbox.append(createOutboxEvent({
          tenantId, type: "payment.registered", aggregateType: "payment", aggregateId: payment.id,
          correlationId: context.correlationId, payload: { paymentId: payment.id, customerId: payment.customerId },
        }));
        return payment;
      },
    });
  }
}
