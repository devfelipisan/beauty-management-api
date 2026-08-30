import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { ProfessionalsModule } from '../professionals/professionals.module.js';
import { ServicesModule } from '../services/services.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { CustomerRestrictionAdapter } from './adapters/customer-restriction.js';
import { D1LicenseEligibilityAdapter, D1PlanLimitAdapter } from '../licensing/adapters/appointment-admission-adapters.js';
import { LicensingModule } from '../licensing/licensing.module.js';
import { D1ProfessionalServiceEligibility } from './adapters/d1-professional-service-eligibility.js';
import { ClinicalAssessmentEligibilityAdapter } from './adapters/clinical-assessment-eligibility.js';
import { CheckAppointmentEligibility } from './application/check-appointment-eligibility.js';
import { ASSESSMENT_ELIGIBILITY } from './ports/assessment-eligibility.port.js';
import { CUSTOMER_RESTRICTION } from './ports/customer-restriction.port.js';
import { LICENSE_ELIGIBILITY } from './ports/license-eligibility.port.js';
import { PLAN_LIMIT } from './ports/plan-limit.port.js';
import { PROFESSIONAL_SERVICE_ELIGIBILITY } from './ports/professional-service-eligibility.port.js';
@Module({ imports:[TenantsModule,CustomersModule,ServicesModule,ProfessionalsModule,AppointmentsModule,LicensingModule], providers:[CheckAppointmentEligibility,CustomerRestrictionAdapter,D1LicenseEligibilityAdapter,D1PlanLimitAdapter,D1ProfessionalServiceEligibility,ClinicalAssessmentEligibilityAdapter,{provide:ASSESSMENT_ELIGIBILITY,useExisting:ClinicalAssessmentEligibilityAdapter},{provide:CUSTOMER_RESTRICTION,useExisting:CustomerRestrictionAdapter},{provide:LICENSE_ELIGIBILITY,useExisting:D1LicenseEligibilityAdapter},{provide:PLAN_LIMIT,useExisting:D1PlanLimitAdapter},{provide:PROFESSIONAL_SERVICE_ELIGIBILITY,useExisting:D1ProfessionalServiceEligibility}], exports:[CheckAppointmentEligibility] })
export class AppointmentEligibilityModule {}
