import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { AssessmentsModule } from './assessments/assessments.module.js';
import { RuntimeConfigModule } from '@beauty/config';
import { ObservabilityModule } from '@beauty/observability';
import { AuthenticationModule } from '@beauty/authentication';
import { TenancyModule } from '@beauty/tenancy';
import { ReliabilityModule } from '@beauty/reliability';
import { D1RuntimeModule } from './d1-runtime.module.js';

@Module({
  imports: [RuntimeConfigModule, ObservabilityModule, AuthenticationModule, TenancyModule, ReliabilityModule, D1RuntimeModule, HealthModule, AssessmentsModule],
  controllers: [],
  providers: [],
})
export class ClinicalWorkerModule {}
