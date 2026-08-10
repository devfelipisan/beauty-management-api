import { CreateDiscountPolicyUseCase, type CreateDiscountPolicyInput } from "@/modules/commercial-policy/application/create-discount-policy";
import type { CommercialPolicyRepository } from "@/modules/commercial-policy/domain/commercial-policy-repository";
import { CreateTenantUserUseCase, UpdateTenantUserUseCase, type CreateTenantUserInput, type UpdateTenantUserInput } from "@/modules/users/application/manage-users";
import type { TenantUserRepository } from "@/modules/users/domain/user-repository";
import type { ExecutionContext } from "@/shared/application/execution-context";

export interface AdministrationApiDependencies {
  users: TenantUserRepository;
  commercialPolicies: CommercialPolicyRepository;
  createUser: CreateTenantUserUseCase;
  updateUser: UpdateTenantUserUseCase;
  createDiscountPolicy: CreateDiscountPolicyUseCase;
}

function requireTenant(context: ExecutionContext): string {
  if (!context.tenantId) throw new Error(`Tenant is required for ${context.operation}.`);
  return context.tenantId;
}

export class AdministrationApi {
  constructor(private readonly dependencies: AdministrationApiDependencies) {}

  listUsers(context: ExecutionContext) {
    return this.dependencies.users.list(requireTenant(context));
  }

  createUser(context: ExecutionContext, input: CreateTenantUserInput) {
    requireTenant(context);
    return this.dependencies.createUser.execute(context, input);
  }

  updateUser(context: ExecutionContext, userId: string, input: UpdateTenantUserInput) {
    requireTenant(context);
    return this.dependencies.updateUser.execute(context, userId, input);
  }

  listRelationshipProfileConfigs(context: ExecutionContext) {
    return this.dependencies.commercialPolicies.listRelationshipProfileConfigs(requireTenant(context));
  }

  listDiscountPolicies(context: ExecutionContext) {
    return this.dependencies.commercialPolicies.listDiscountPolicies(requireTenant(context));
  }

  listDiscountApprovals(context: ExecutionContext) {
    return this.dependencies.commercialPolicies.listDiscountApprovals(requireTenant(context));
  }

  createDiscountPolicy(context: ExecutionContext, input: CreateDiscountPolicyInput) {
    requireTenant(context);
    return this.dependencies.createDiscountPolicy.execute(context, input);
  }
}
