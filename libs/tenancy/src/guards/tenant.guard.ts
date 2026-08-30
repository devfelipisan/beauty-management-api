import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { ExecutionContext as RequestExecutionContext } from '../../../execution-context/src/index.js';
import type { AuthenticatedIdentity } from '../../../authentication/src/authenticated-identity.js';
import { TENANT_MEMBERSHIP_PROVIDER, type TenantMembershipProvider } from '../ports/tenant-membership-provider.js';
import type { TenantContext } from '../tenant-context.js';
import type { TenantMembership } from '../tenant-membership.js';

type TenantRequest = Request & {
  user?: AuthenticatedIdentity;
  tenantContext?: TenantContext;
  tenantMembership?: TenantMembership;
  executionContext?: RequestExecutionContext;
};

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    @Inject(TENANT_MEMBERSHIP_PROVIDER)
    private readonly membershipProvider: TenantMembershipProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    if (!request.user) throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' });

    const candidateTenantId = request.params?.tenantId;
    if (typeof candidateTenantId !== 'string' || !candidateTenantId) {
      throw new ForbiddenException({ code: 'TENANT_ACCESS_DENIED' });
    }

    const membership = await this.membershipProvider.findActiveMembership(
      request.user.actorId,
      candidateTenantId,
    );
    if (!membership?.active || membership.actorId !== request.user.actorId) {
      throw new ForbiddenException({ code: 'TENANT_ACCESS_DENIED' });
    }

    request.tenantMembership = membership;
    request.tenantContext = {
      tenantId: membership.tenantId,
      actorId: membership.actorId,
    };
    if (request.executionContext) request.executionContext.tenantId = membership.tenantId;
    return true;
  }
}
