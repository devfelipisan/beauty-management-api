import { Module } from '@nestjs/common';
import { ServicesController } from './services.controller.js';
import { D1ServiceRepository } from '@beauty/operations/modules/services/infrastructure/d1-service-repository';
import { SERVICE_REPOSITORY } from '@beauty/operations/modules/services/ports/service-repository';
import {
  CreateServiceUseCase,
  DeactivateServiceUseCase,
  GetServiceUseCase,
  ListServicesUseCase,
  UpdateServiceUseCase,
} from '@beauty/operations/modules/services/application/use-cases';
import { TenancyModule } from '@beauty/tenancy';
import { AuthenticationModule } from '@beauty/authentication';

@Module({
  imports: [TenancyModule, AuthenticationModule],
  controllers: [ServicesController],
  providers: [
    D1ServiceRepository,
    { provide: SERVICE_REPOSITORY, useExisting: D1ServiceRepository },
    {
      provide: CreateServiceUseCase,
      inject: [SERVICE_REPOSITORY],
      useFactory: (
        repository: ConstructorParameters<typeof CreateServiceUseCase>[0],
      ) => new CreateServiceUseCase(repository, false),
    },
    {
      provide: DeactivateServiceUseCase,
      inject: [SERVICE_REPOSITORY],
      useFactory: (
        repository: ConstructorParameters<typeof DeactivateServiceUseCase>[0],
      ) => new DeactivateServiceUseCase(repository),
    },
    {
      provide: GetServiceUseCase,
      inject: [SERVICE_REPOSITORY],
      useFactory: (
        repository: ConstructorParameters<typeof GetServiceUseCase>[0],
      ) => new GetServiceUseCase(repository),
    },
    {
      provide: ListServicesUseCase,
      inject: [SERVICE_REPOSITORY],
      useFactory: (
        repository: ConstructorParameters<typeof ListServicesUseCase>[0],
      ) => new ListServicesUseCase(repository),
    },
    {
      provide: UpdateServiceUseCase,
      inject: [SERVICE_REPOSITORY],
      useFactory: (
        repository: ConstructorParameters<typeof UpdateServiceUseCase>[0],
      ) => new UpdateServiceUseCase(repository, false),
    },
  ],
  exports: [
    SERVICE_REPOSITORY,
    CreateServiceUseCase,
    DeactivateServiceUseCase,
    GetServiceUseCase,
    ListServicesUseCase,
    UpdateServiceUseCase,
  ],
})
export class ServicesModule {}
