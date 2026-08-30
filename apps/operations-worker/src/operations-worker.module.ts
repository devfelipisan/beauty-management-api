import { Module } from '@nestjs/common';
import { RuntimeConfigModule } from '../../../libs/config/src/index.js';
import { ObservabilityModule } from '../../../libs/observability/src/index.js';
import { AuthenticationModule } from '../../../libs/authentication/src/index.js';
import { TenancyModule } from '../../../libs/tenancy/src/index.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [RuntimeConfigModule, ObservabilityModule, AuthenticationModule, TenancyModule, HealthModule],
})
export class OperationsWorkerModule {}
