import { Module } from '@nestjs/common';
import { RuntimeConfigModule } from '../../../libs/config/src/index.js';
import { ObservabilityModule } from '../../../libs/observability/src/index.js';
import { AuthenticationModule } from '../../../libs/authentication/src/index.js';
import { TenancyModule } from '../../../libs/tenancy/src/index.js';
import { HealthModule } from './health/health.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { ProfessionalsModule } from './professionals/professionals.module.js';
import { ServicesModule } from './services/services.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { D1RuntimeModule } from './d1-runtime.module.js';
import { ReliabilityModule } from '../../../libs/reliability/src/index.js';
import { AppointmentsModule } from './appointments/appointments.module.js';

@Module({
  imports: [RuntimeConfigModule, ObservabilityModule, AuthenticationModule, TenancyModule, HealthModule, D1RuntimeModule, ReliabilityModule, TenantsModule, ProfessionalsModule, ServicesModule, CustomersModule, AppointmentsModule],
})
export class OperationsWorkerModule {}
