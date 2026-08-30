import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { AssessmentsModule } from './assessments/assessments.module.js';
import { RuntimeConfigModule } from '../../../libs/config/src/index.js';
import { ObservabilityModule } from '../../../libs/observability/src/index.js';
import { AuthenticationModule } from '../../../libs/authentication/src/index.js';
import { TenancyModule } from '../../../libs/tenancy/src/index.js';
import { ReliabilityModule } from '../../../libs/reliability/src/index.js';
import { D1RuntimeModule } from './d1-runtime.module.js';

@Module({
  imports: [RuntimeConfigModule, ObservabilityModule, AuthenticationModule, TenancyModule, ReliabilityModule, D1RuntimeModule, HealthModule, AssessmentsModule],
  controllers: [],
  providers: [],
})
export class ClinicalWorkerModule {}
