import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { TenantContext } from '../tenant-context.js';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantContext | undefined =>
    context.switchToHttp().getRequest<{ tenantContext?: TenantContext }>().tenantContext,
);
