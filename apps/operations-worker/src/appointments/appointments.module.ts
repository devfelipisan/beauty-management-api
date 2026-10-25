import { Module } from '@nestjs/common';
import { D1AppointmentRepository } from '@beauty/operations/modules/appointments/infrastructure/d1-appointment-repository';
import { D1AvailabilityRepository } from '@beauty/operations/modules/appointments/infrastructure/d1-availability-repository';
import { CheckProfessionalAvailabilityUseCase } from '@beauty/operations/modules/appointments/application/check-professional-availability.use-case';
import { AppointmentsController } from './appointments.controller.js';
import { APPOINTMENT_REPOSITORY } from '@beauty/operations/modules/appointments/ports/appointment-repository';
import { AVAILABILITY_REPOSITORY } from '@beauty/operations/modules/appointments/ports/availability-repository';
import { TenancyModule } from '@beauty/tenancy';
import { AuthenticationModule } from '@beauty/authentication';
import { UnavailableCommercialTerms } from '@beauty/operations/modules/appointments/infrastructure/unavailable-commercial-terms';
import { COMMERCIAL_TERMS } from '@beauty/operations/modules/appointments/ports/commercial-terms-port';
@Module({ imports:[TenancyModule, AuthenticationModule], controllers:[AppointmentsController], providers:[D1AppointmentRepository,D1AvailabilityRepository,UnavailableCommercialTerms,{provide:APPOINTMENT_REPOSITORY,useExisting:D1AppointmentRepository},{provide:AVAILABILITY_REPOSITORY,useExisting:D1AvailabilityRepository},{provide:COMMERCIAL_TERMS,useExisting:UnavailableCommercialTerms},{ provide: CheckProfessionalAvailabilityUseCase, inject: [AVAILABILITY_REPOSITORY], useFactory: (repository: ConstructorParameters<typeof CheckProfessionalAvailabilityUseCase>[0]) => new CheckProfessionalAvailabilityUseCase(repository) }], exports:[APPOINTMENT_REPOSITORY,AVAILABILITY_REPOSITORY,COMMERCIAL_TERMS] })
export class AppointmentsModule {}
