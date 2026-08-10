import type { ExecutionContext } from "@/shared/application/execution-context";
import { NotFoundError } from "@/shared/domain/core";
import { createTenantUser, duplicateUserEmail, updateTenantUser, type CreateTenantUserProps, type UpdateTenantUserProps } from "../domain/user";
import type { TenantUserRepository } from "../domain/user-repository";

function requireTenant(context: ExecutionContext): string {
  if (!context.tenantId) throw new Error(`Tenant is required for ${context.operation}.`);
  return context.tenantId;
}

export type CreateTenantUserInput = Omit<CreateTenantUserProps, "tenantId">;
export type UpdateTenantUserInput = UpdateTenantUserProps;

export class CreateTenantUserUseCase {
  constructor(private readonly users: TenantUserRepository) {}

  async execute(context: ExecutionContext, input: CreateTenantUserInput) {
    const tenantId = requireTenant(context);
    const existing = await this.users.findByEmail(tenantId, input.email.trim().toLowerCase());
    if (existing) throw duplicateUserEmail(input.email.trim().toLowerCase());
    return this.users.create(createTenantUser({ tenantId, ...input }));
  }
}

export class UpdateTenantUserUseCase {
  constructor(private readonly users: TenantUserRepository) {}

  async execute(context: ExecutionContext, userId: string, input: UpdateTenantUserInput) {
    const tenantId = requireTenant(context);
    const current = await this.users.findById(tenantId, userId);
    if (!current) throw new NotFoundError("user", userId);
    return this.users.update(updateTenantUser(current, input));
  }
}
