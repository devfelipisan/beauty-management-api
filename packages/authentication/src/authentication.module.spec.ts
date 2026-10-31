import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthenticationModule } from './authentication.module.js';
import { IDENTITY_PROVIDER } from './ports/identity-provider.js';
import { MockIdentityProvider } from './adapters/mock-identity-provider.js';
import { JwtIdentityProvider } from './adapters/jwt-identity-provider.js';

function compile(
  values: Record<string, unknown>,
  directory?: { findIdentity: ReturnType<typeof vi.fn> },
) {
  return Test.createTestingModule({
    imports: [
      directory
        ? AuthenticationModule.register(directory)
        : AuthenticationModule,
    ],
  })
    .overrideProvider(ConfigService)
    .useValue(new ConfigService(values))
    .compile();
}
describe('authentication module provider selection', () => {
  it.each(['test', 'local'])(
    'selects explicit fixture authentication for %s',
    async (APP_ENV) => {
      const module = await compile({ APP_ENV, AUTH_PROVIDER: 'mock' });
      try {
        const provider = module.get<MockIdentityProvider>(IDENTITY_PROVIDER);
        expect(provider).toBeInstanceOf(MockIdentityProvider);
        expect(await provider.authenticate('actor-example')).toEqual({
          actorId: 'actor-example',
          subject: 'actor-example',
        });
        expect(await provider.authenticate('invalid')).toBeNull();
        expect(await provider.authenticate(' ')).toBeNull();
      } finally {
        await module.close();
      }
    },
  );
  it.each([
    {},
    { APP_ENV: 'production', AUTH_PROVIDER: 'mock' },
    { APP_ENV: 'test', AUTH_PROVIDER: 'invalid' },
    { APP_ENV: 'production', AUTH_PROVIDER: 'jwt' },
  ])('fails closed without authorized composition: %j', async (values) => {
    await expect(compile(values)).rejects.toThrow(
      'INVALID_AUTHENTICATION_CONFIGURATION',
    );
  });
  it('injects the registered external identity directory for JWT without network requests during composition', async () => {
    const directory = { findIdentity: vi.fn() };
    const module = await compile(
      {
        APP_ENV: 'production',
        AUTH_PROVIDER: 'jwt',
        AUTH_ISSUER: 'https://identity.test/auth/v1',
        AUTH_AUDIENCE: 'api',
        AUTH_JWKS_URL: 'https://identity.test/auth/v1/.well-known/jwks.json',
        AUTH_ALGORITHM: 'ES256',
      },
      directory,
    );
    try {
      expect(module.get(IDENTITY_PROVIDER)).toBeInstanceOf(JwtIdentityProvider);
      expect(directory.findIdentity).not.toHaveBeenCalled();
    } finally {
      await module.close();
    }
  });
  it('does not substitute fixtures when JWT configuration is incomplete', async () => {
    await expect(
      compile(
        { APP_ENV: 'production', AUTH_PROVIDER: 'jwt' },
        { findIdentity: vi.fn() },
      ),
    ).rejects.toThrow('AUTH_ISSUER');
  });
});
