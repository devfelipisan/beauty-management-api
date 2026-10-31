import { Module, type DynamicModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MockIdentityProvider } from './adapters/mock-identity-provider.js';
import { AuthenticationGuard } from './guards/authentication.guard.js';
import { PermissionGuard } from './guards/permission.guard.js';
import { IDENTITY_PROVIDER } from './ports/identity-provider.js';
import {
  JwtIdentityProvider,
  type IdentityDirectory,
} from './adapters/jwt-identity-provider.js';

export const IDENTITY_DIRECTORY = Symbol('IDENTITY_DIRECTORY');

@Module({
  imports: [ConfigModule],
  providers: [
    MockIdentityProvider,
    AuthenticationGuard,
    PermissionGuard,
    {
      provide: IDENTITY_PROVIDER,
      inject: [
        ConfigService,
        MockIdentityProvider,
        { token: IDENTITY_DIRECTORY, optional: true },
      ],
      useFactory: (
        config: ConfigService,
        mock: MockIdentityProvider,
        directory?: IdentityDirectory,
      ) => {
        const provider = config.get<string>('AUTH_PROVIDER', 'mock');
        if (
          provider === 'mock' &&
          ['local', 'test'].includes(config.get<string>('APP_ENV', ''))
        )
          return mock;
        if (provider === 'jwt' && directory)
          return new JwtIdentityProvider(
            {
              issuer: config.getOrThrow<string>('AUTH_ISSUER'),
              audience: config.getOrThrow<string>('AUTH_AUDIENCE'),
              jwksUrl: config.getOrThrow<string>('AUTH_JWKS_URL'),
              algorithms: [config.getOrThrow<string>('AUTH_ALGORITHM')],
            },
            directory,
          );
        throw new Error('INVALID_AUTHENTICATION_CONFIGURATION');
      },
    },
  ],
  exports: [AuthenticationGuard, PermissionGuard, IDENTITY_PROVIDER],
})
export class AuthenticationModule {
  static register(directory: IdentityDirectory): DynamicModule {
    return {
      module: AuthenticationModule,
      providers: [{ provide: IDENTITY_DIRECTORY, useValue: directory }],
    };
  }
}
