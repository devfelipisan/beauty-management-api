import { Module } from '@nestjs/common';
import { ServicesController } from './services.controller.js';
import { D1ServiceRepository } from './adapters/d1-service-repository.js';
import { SERVICE_REPOSITORY } from './ports/service-repository.js';
import { CreateServiceUseCase, DeactivateServiceUseCase, GetServiceUseCase, ListServicesUseCase, UpdateServiceUseCase } from './application/use-cases.js';
import { TenancyModule } from '../../../../libs/tenancy/src/index.js';
import { AuthenticationModule } from '../../../../libs/authentication/src/index.js';

@Module({
  imports: [TenancyModule, AuthenticationModule],
  controllers: [ServicesController],
  providers: [D1ServiceRepository, { provide: SERVICE_REPOSITORY, useExisting: D1ServiceRepository }, CreateServiceUseCase, DeactivateServiceUseCase, GetServiceUseCase, ListServicesUseCase, UpdateServiceUseCase],
  exports: [SERVICE_REPOSITORY, CreateServiceUseCase, DeactivateServiceUseCase, GetServiceUseCase, ListServicesUseCase, UpdateServiceUseCase],
})
export class ServicesModule {}
