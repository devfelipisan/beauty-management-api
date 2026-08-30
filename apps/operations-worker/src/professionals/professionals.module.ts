import { Module } from '@nestjs/common';
import { ProfessionalsController } from './professionals.controller.js';
import { D1ProfessionalRepository } from './adapters/d1-professional-repository.js';
import { PROFESSIONAL_REPOSITORY } from './ports/professional-repository.js';
import { CreateProfessionalUseCase, DeactivateProfessionalUseCase, GetProfessionalUseCase, ListProfessionalsUseCase, UpdateProfessionalUseCase } from './application/use-cases.js';
import { TenancyModule } from '../../../../libs/tenancy/src/index.js';
import { D1ProfessionalServiceRepository } from './adapters/d1-professional-service-repository.js';
import { PROFESSIONAL_SERVICE_REPOSITORY } from './ports/professional-service-repository.js';

@Module({
  imports: [TenancyModule],
  controllers: [ProfessionalsController],
  providers: [D1ProfessionalRepository, D1ProfessionalServiceRepository, { provide: PROFESSIONAL_REPOSITORY, useExisting: D1ProfessionalRepository }, { provide: PROFESSIONAL_SERVICE_REPOSITORY, useExisting: D1ProfessionalServiceRepository }, CreateProfessionalUseCase, DeactivateProfessionalUseCase, GetProfessionalUseCase, ListProfessionalsUseCase, UpdateProfessionalUseCase],
  exports: [PROFESSIONAL_REPOSITORY, CreateProfessionalUseCase, DeactivateProfessionalUseCase, GetProfessionalUseCase, ListProfessionalsUseCase, UpdateProfessionalUseCase],
})
export class ProfessionalsModule {}
