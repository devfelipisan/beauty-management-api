import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MockIdentityProvider } from './adapters/mock-identity-provider.js';
import { AuthenticationGuard } from './guards/authentication.guard.js';
import { PermissionGuard } from './guards/permission.guard.js';
import { IDENTITY_PROVIDER } from './ports/identity-provider.js';

@Module({
  imports: [ConfigModule],
  providers: [
    MockIdentityProvider,
    AuthenticationGuard,
    PermissionGuard,
    {
      provide: IDENTITY_PROVIDER,
      inject: [ConfigService, MockIdentityProvider],
      useFactory: (config: ConfigService, mock: MockIdentityProvider) => {
        const provider = config.get<string>('AUTH_PROVIDER', 'mock');
        if (provider === 'mock') return mock;
        throw new Error(`Unsupported AUTH_PROVIDER: ${provider}`);
      },
    },
  ],
  exports: [AuthenticationGuard, PermissionGuard, IDENTITY_PROVIDER],
})
export class AuthenticationModule {}
