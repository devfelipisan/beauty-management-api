import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { ObservabilityModule } from '../../../libs/observability/src/index.js';
import { AuthenticationModule } from '../../../libs/authentication/src/index.js';
import { TenancyModule } from '../../../libs/tenancy/src/index.js';
import { RuntimeConfigModule } from '../../../libs/config/src/index.js';

@Module({
  imports: [RuntimeConfigModule, ObservabilityModule, AuthenticationModule, TenancyModule, HealthModule],
})
export class AppModule {}
