import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { ExecutionContext as RequestExecutionContext } from '@beauty/execution-context';
import type { AuthenticatedIdentity } from '../authenticated-identity.js';
import { IDENTITY_PROVIDER, type IdentityProvider } from '../ports/identity-provider.js';

type AuthenticatedRequest = Request & {
  user?: AuthenticatedIdentity;
  executionContext?: RequestExecutionContext;
};

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly identityProvider: IdentityProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.header('authorization');
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    if (!match) throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' });

    const identity = await this.identityProvider.authenticate(match[1]);
    if (!identity) throw new UnauthorizedException({ code: 'INVALID_AUTHENTICATION' });

    request.user = identity;
    if (request.executionContext) request.executionContext.actorId = identity.actorId;
    return true;
  }
}
