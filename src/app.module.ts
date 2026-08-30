import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { RuntimeConfigModule } from './infrastructure/config/config.module.js';
import { ObservabilityModule } from './infrastructure/observability/observability.module.js';
import { HealthModule } from './health/health.module.js';
@Module({
  imports: [RuntimeConfigModule, ObservabilityModule, HealthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
