import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { CommercialTermsModule } from './commercial-terms/commercial-terms.module.js';
import { RuntimeConfigModule } from '../../../libs/config/src/index.js';
import { ObservabilityModule } from '../../../libs/observability/src/index.js';
import { AuthenticationModule } from '../../../libs/authentication/src/index.js';
import { TenancyModule } from '../../../libs/tenancy/src/index.js';
import { ReliabilityModule } from '../../../libs/reliability/src/index.js';
import { BillingD1RuntimeModule } from './billing-d1-runtime.module.js';

@Module({
  imports: [RuntimeConfigModule, ObservabilityModule, AuthenticationModule, TenancyModule, BillingD1RuntimeModule, ReliabilityModule, HealthModule, CommercialTermsModule],
})
export class BillingWorkerModule {}
