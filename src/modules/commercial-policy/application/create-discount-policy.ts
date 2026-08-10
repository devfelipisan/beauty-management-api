import type { ExecutionContext } from "@/shared/application/execution-context";
import { createDiscountPolicy, type CreateDiscountPolicyProps } from "../domain/commercial-policy";
import type { CommercialPolicyRepository } from "../domain/commercial-policy-repository";

export type CreateDiscountPolicyInput = Omit<CreateDiscountPolicyProps, "tenantId">;

export class CreateDiscountPolicyUseCase {
  constructor(private readonly repository: CommercialPolicyRepository) {}

  async execute(context: ExecutionContext, input: CreateDiscountPolicyInput) {
    if (!context.tenantId) throw new Error(`Tenant is required for ${context.operation}.`);
    return this.repository.createDiscountPolicy(createDiscountPolicy({ tenantId: context.tenantId, ...input }));
  }
}
