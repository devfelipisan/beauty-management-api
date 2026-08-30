import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { ObservabilityModule } from '@beauty/observability';
import { RuntimeConfigModule } from './infrastructure/config/config.module.js';

@Module({
  imports: [RuntimeConfigModule, ObservabilityModule, HealthModule],
})
export class AppModule {}
