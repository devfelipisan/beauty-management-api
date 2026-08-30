import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { ProfessionalsModule } from '../professionals/professionals.module.js';
import { ServicesModule } from '../services/services.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { UnavailableAssessmentEligibility, UnavailableCustomerRestriction, UnavailableLicenseEligibility, UnavailablePlanLimit } from './adapters/unavailable-capabilities.js';
import { D1ProfessionalServiceEligibility } from './adapters/d1-professional-service-eligibility.js';
import { CheckAppointmentEligibility } from './application/check-appointment-eligibility.js';
import { ASSESSMENT_ELIGIBILITY } from './ports/assessment-eligibility.port.js';
import { CUSTOMER_RESTRICTION } from './ports/customer-restriction.port.js';
import { LICENSE_ELIGIBILITY } from './ports/license-eligibility.port.js';
import { PLAN_LIMIT } from './ports/plan-limit.port.js';
import { PROFESSIONAL_SERVICE_ELIGIBILITY } from './ports/professional-service-eligibility.port.js';
@Module({ imports:[TenantsModule,CustomersModule,ServicesModule,ProfessionalsModule,AppointmentsModule], providers:[CheckAppointmentEligibility,UnavailableAssessmentEligibility,UnavailableCustomerRestriction,UnavailableLicenseEligibility,UnavailablePlanLimit,D1ProfessionalServiceEligibility,{provide:ASSESSMENT_ELIGIBILITY,useExisting:UnavailableAssessmentEligibility},{provide:CUSTOMER_RESTRICTION,useExisting:UnavailableCustomerRestriction},{provide:LICENSE_ELIGIBILITY,useExisting:UnavailableLicenseEligibility},{provide:PLAN_LIMIT,useExisting:UnavailablePlanLimit},{provide:PROFESSIONAL_SERVICE_ELIGIBILITY,useExisting:D1ProfessionalServiceEligibility}], exports:[CheckAppointmentEligibility] })
export class AppointmentEligibilityModule {}
