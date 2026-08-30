import { Injectable } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../authenticated-identity.js';
import type { IdentityProvider } from '../ports/identity-provider.js';

@Injectable()
export class MockIdentityProvider implements IdentityProvider {
  async authenticate(token: string): Promise<AuthenticatedIdentity | null> {
    const actorId = token.trim();
    if (!actorId || !/^actor-[a-z0-9-]+$/.test(actorId)) return null;
    return { actorId, subject: actorId };
  }
}
