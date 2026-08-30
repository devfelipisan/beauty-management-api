import { Module } from '@nestjs/common';
import { D1AppointmentRepository } from './adapters/d1-appointment-repository.js';
import { D1AvailabilityRepository } from './adapters/d1-availability-repository.js';
import { CheckProfessionalAvailabilityUseCase } from './application/check-professional-availability.use-case.js';
import { AppointmentsController } from './appointments.controller.js';
import { APPOINTMENT_REPOSITORY } from './ports/appointment-repository.js';
import { AVAILABILITY_REPOSITORY } from './ports/availability-repository.js';
import { TenancyModule } from '../../../../libs/tenancy/src/index.js';
import { AuthenticationModule } from '../../../../libs/authentication/src/index.js';
@Module({ imports:[TenancyModule, AuthenticationModule], controllers:[AppointmentsController], providers:[D1AppointmentRepository,D1AvailabilityRepository,{provide:APPOINTMENT_REPOSITORY,useExisting:D1AppointmentRepository},{provide:AVAILABILITY_REPOSITORY,useExisting:D1AvailabilityRepository},CheckProfessionalAvailabilityUseCase], exports:[APPOINTMENT_REPOSITORY,AVAILABILITY_REPOSITORY] })
export class AppointmentsModule {}
