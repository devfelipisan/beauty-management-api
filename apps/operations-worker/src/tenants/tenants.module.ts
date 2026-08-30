import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller.js';
import { D1TenantRepository } from './adapters/d1-tenant-repository.js';
import { TENANT_REPOSITORY } from './ports/tenant-repository.js';
import { CreateTenantUseCase, GetTenantUseCase, UpdateTenantUseCase } from './application/use-cases.js';

@Module({
  controllers: [TenantsController],
  providers: [D1TenantRepository, { provide: TENANT_REPOSITORY, useExisting: D1TenantRepository }, CreateTenantUseCase, GetTenantUseCase, UpdateTenantUseCase],
  exports: [TENANT_REPOSITORY, CreateTenantUseCase, GetTenantUseCase, UpdateTenantUseCase],
})
export class TenantsModule {}
