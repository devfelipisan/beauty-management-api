import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { ObservabilityModule } from '@beauty/observability';
import { AuthenticationModule } from '@beauty/authentication';
import { TenancyModule } from '@beauty/tenancy';
import { RuntimeConfigModule } from '@beauty/config';

@Module({
  imports: [RuntimeConfigModule, ObservabilityModule, AuthenticationModule, TenancyModule, HealthModule],
})
export class AppModule {}
