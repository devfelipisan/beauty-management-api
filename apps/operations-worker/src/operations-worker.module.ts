import { Module } from '@nestjs/common';
import { RuntimeConfigModule } from '@beauty/config';
import { ObservabilityModule } from '@beauty/observability';
import { AuthenticationModule } from '@beauty/authentication';
import { TenancyModule } from '@beauty/tenancy';
import { HealthModule } from './health/health.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { ProfessionalsModule } from './professionals/professionals.module.js';
import { ServicesModule } from './services/services.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { D1RuntimeModule } from './d1-runtime.module.js';
import { ReliabilityModule } from '@beauty/reliability';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { AppointmentEligibilityModule } from './appointment-eligibility/appointment-eligibility.module.js';
import { LicensingModule } from './licensing/licensing.module.js';

@Module({
  imports: [RuntimeConfigModule, ObservabilityModule, AuthenticationModule, TenancyModule, HealthModule, D1RuntimeModule, ReliabilityModule, TenantsModule, ProfessionalsModule, ServicesModule, CustomersModule, LicensingModule, AppointmentsModule, AppointmentEligibilityModule],
})
export class OperationsWorkerModule {}
