import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { ObservabilityModule } from './infrastructure/observability/observability.module.js';
import { RuntimeConfigModule } from './infrastructure/config/config.module.js';

@Module({
  imports: [RuntimeConfigModule, ObservabilityModule, HealthModule],
})
export class AppModule {}
