import { Module } from '@nestjs/common';
import { ProfessionalsController } from './professionals.controller.js';
import { D1ProfessionalRepository } from '@beauty/operations/modules/professionals/infrastructure/d1-professional-repository';
import { PROFESSIONAL_REPOSITORY } from '@beauty/operations/modules/professionals/ports/professional-repository';
import { CreateProfessionalUseCase, DeactivateProfessionalUseCase, GetProfessionalUseCase, ListProfessionalsUseCase, UpdateProfessionalUseCase } from '@beauty/operations/modules/professionals/application/use-cases';
import { TenancyModule } from '@beauty/tenancy';
import { D1ProfessionalServiceRepository } from '@beauty/operations/modules/professionals/infrastructure/d1-professional-service-repository';
import { AuthenticationModule } from '@beauty/authentication';
import { PROFESSIONAL_SERVICE_REPOSITORY } from '@beauty/operations/modules/professionals/ports/professional-service-repository';

@Module({
  imports: [TenancyModule, AuthenticationModule],
  controllers: [ProfessionalsController],
  providers: [D1ProfessionalRepository, D1ProfessionalServiceRepository, { provide: PROFESSIONAL_REPOSITORY, useExisting: D1ProfessionalRepository }, { provide: PROFESSIONAL_SERVICE_REPOSITORY, useExisting: D1ProfessionalServiceRepository }, { provide: CreateProfessionalUseCase, inject: [PROFESSIONAL_REPOSITORY], useFactory: (repository: ConstructorParameters<typeof CreateProfessionalUseCase>[0]) => new CreateProfessionalUseCase(repository) }, { provide: DeactivateProfessionalUseCase, inject: [PROFESSIONAL_REPOSITORY], useFactory: (repository: ConstructorParameters<typeof DeactivateProfessionalUseCase>[0]) => new DeactivateProfessionalUseCase(repository) }, { provide: GetProfessionalUseCase, inject: [PROFESSIONAL_REPOSITORY], useFactory: (repository: ConstructorParameters<typeof GetProfessionalUseCase>[0]) => new GetProfessionalUseCase(repository) }, { provide: ListProfessionalsUseCase, inject: [PROFESSIONAL_REPOSITORY], useFactory: (repository: ConstructorParameters<typeof ListProfessionalsUseCase>[0]) => new ListProfessionalsUseCase(repository) }, { provide: UpdateProfessionalUseCase, inject: [PROFESSIONAL_REPOSITORY], useFactory: (repository: ConstructorParameters<typeof UpdateProfessionalUseCase>[0]) => new UpdateProfessionalUseCase(repository) }],
  exports: [PROFESSIONAL_REPOSITORY, CreateProfessionalUseCase, DeactivateProfessionalUseCase, GetProfessionalUseCase, ListProfessionalsUseCase, UpdateProfessionalUseCase],
})
export class ProfessionalsModule {}
