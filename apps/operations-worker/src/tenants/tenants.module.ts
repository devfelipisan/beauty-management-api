import { Module } from '@nestjs/common';
import { AuthenticationModule } from '@beauty/authentication';
import { TenantsController } from './tenants.controller.js';
import { D1TenantRepository } from '@beauty/operations/modules/tenants/infrastructure/d1-tenant-repository';
import { TENANT_REPOSITORY } from '@beauty/operations/modules/tenants/ports/tenant-repository';
import {
  CreateTenantUseCase,
  GetTenantUseCase,
  UpdateTenantUseCase,
} from '@beauty/operations/modules/tenants/application/use-cases';

@Module({
  imports: [AuthenticationModule],
  controllers: [TenantsController],
  providers: [
    D1TenantRepository,
    { provide: TENANT_REPOSITORY, useExisting: D1TenantRepository },
    {
      provide: CreateTenantUseCase,
      inject: [TENANT_REPOSITORY],
      useFactory: (
        repository: ConstructorParameters<typeof CreateTenantUseCase>[0],
      ) => new CreateTenantUseCase(repository),
    },
    {
      provide: GetTenantUseCase,
      inject: [TENANT_REPOSITORY],
      useFactory: (
        repository: ConstructorParameters<typeof GetTenantUseCase>[0],
      ) => new GetTenantUseCase(repository),
    },
    {
      provide: UpdateTenantUseCase,
      inject: [TENANT_REPOSITORY],
      useFactory: (
        repository: ConstructorParameters<typeof UpdateTenantUseCase>[0],
      ) => new UpdateTenantUseCase(repository),
    },
  ],
  exports: [
    TENANT_REPOSITORY,
    CreateTenantUseCase,
    GetTenantUseCase,
    UpdateTenantUseCase,
  ],
})
export class TenantsModule {}
