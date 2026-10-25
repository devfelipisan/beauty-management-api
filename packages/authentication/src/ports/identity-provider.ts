import type { AuthenticatedIdentity } from '../authenticated-identity.js';

export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');

export interface IdentityProvider {
  authenticate(token: string): Promise<AuthenticatedIdentity | null>;
}
