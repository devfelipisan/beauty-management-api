import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { IdentityProvider } from '../ports/identity-provider.js';
import type { AuthenticatedIdentity } from '../authenticated-identity.js';

export interface JwtIdentityConfiguration {
  issuer: string;
  audience: string;
  jwksUrl: string;
  algorithms: string[];
}

export interface IdentityDirectory {
  findIdentity(
    issuer: string,
    subject: string,
  ): Promise<AuthenticatedIdentity | null>;
}

/** Verifies credentials before looking up the internal actor; never provisions users. */
export class JwtIdentityProvider implements IdentityProvider {
  private readonly keys: JWTVerifyGetKey;
  private readonly config: JwtIdentityConfiguration;

  constructor(
    config: JwtIdentityConfiguration,
    private readonly directory: IdentityDirectory,
    keys?: JWTVerifyGetKey,
  ) {
    if (
      !config.issuer ||
      !config.audience ||
      !config.algorithms.length ||
      config.algorithms.some(
        (algorithm) => !['ES256', 'RS256'].includes(algorithm),
      )
    ) {
      throw new Error('INVALID_AUTHENTICATION_CONFIGURATION');
    }
    const issuer = new URL(config.issuer);
    const jwks = new URL(config.jwksUrl);
    if (
      issuer.protocol !== 'https:' ||
      jwks.protocol !== 'https:' ||
      issuer.origin !== jwks.origin ||
      issuer.username ||
      issuer.password ||
      jwks.username ||
      jwks.password
    ) {
      throw new Error('INVALID_AUTHENTICATION_CONFIGURATION');
    }
    this.config = { ...config, algorithms: [...config.algorithms] };
    this.keys = keys ?? createRemoteJWKSet(jwks);
  }

  async authenticate(token: string): Promise<AuthenticatedIdentity | null> {
    let issuer: string;
    let subject: string;
    try {
      const { payload, protectedHeader } = await jwtVerify(token, this.keys, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: this.config.algorithms,
        requiredClaims: ['sub', 'iss', 'aud', 'exp'],
      });
      if (
        !protectedHeader.kid ||
        !payload.sub?.trim() ||
        (payload.iat !== undefined &&
          payload.iat > Math.floor(Date.now() / 1000))
      )
        return null;
      issuer = payload.iss!;
      subject = payload.sub;
    } catch {
      // Credentials and upstream/JWKS error messages must not escape into logs or responses.
      return null;
    }
    return this.directory.findIdentity(issuer, subject);
  }
}
