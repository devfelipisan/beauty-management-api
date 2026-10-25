import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { CommercialTermsModule } from './commercial-terms/commercial-terms.module.js';
import { RuntimeConfigModule } from '@beauty/config';
import { ObservabilityModule } from '@beauty/observability';
import { AuthenticationModule } from '@beauty/authentication';
import { TenancyModule } from '@beauty/tenancy';
import { ReliabilityModule } from '@beauty/reliability';
import { BillingD1RuntimeModule } from './billing-d1-runtime.module.js';

@Module({
  imports: [RuntimeConfigModule, ObservabilityModule, AuthenticationModule, TenancyModule, BillingD1RuntimeModule, ReliabilityModule, HealthModule, CommercialTermsModule],
})
export class BillingWorkerModule {}
