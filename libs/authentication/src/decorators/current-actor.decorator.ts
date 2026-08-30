import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../authenticated-identity.js';

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedIdentity | undefined =>
    context.switchToHttp().getRequest<{ user?: AuthenticatedIdentity }>().user,
);
