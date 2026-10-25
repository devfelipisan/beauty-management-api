import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { ProfessionalsModule } from '../professionals/professionals.module.js';
import { ServicesModule } from '../services/services.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { CustomerRestrictionAdapter } from '@beauty/operations/modules/appointment-eligibility/infrastructure/customer-restriction';
import { D1LicenseEligibilityAdapter, D1PlanLimitAdapter } from '@beauty/operations/modules/licensing/infrastructure/appointment-admission-adapters';
import { LicensingModule } from '../licensing/licensing.module.js';
import { D1ProfessionalServiceEligibility } from '@beauty/operations/modules/appointment-eligibility/infrastructure/d1-professional-service-eligibility';
import { ClinicalAssessmentEligibilityAdapter } from '@beauty/operations/modules/appointment-eligibility/infrastructure/clinical-assessment-eligibility';
import { CheckAppointmentEligibility } from '@beauty/operations/modules/appointment-eligibility/application/check-appointment-eligibility';
import { ASSESSMENT_ELIGIBILITY } from '@beauty/operations/modules/appointment-eligibility/ports/assessment-eligibility.port';
import { CUSTOMER_RESTRICTION } from '@beauty/operations/modules/appointment-eligibility/ports/customer-restriction.port';
import { LICENSE_ELIGIBILITY } from '@beauty/operations/modules/appointment-eligibility/ports/license-eligibility.port';
import { PLAN_LIMIT } from '@beauty/operations/modules/appointment-eligibility/ports/plan-limit.port';
import { PROFESSIONAL_SERVICE_ELIGIBILITY } from '@beauty/operations/modules/appointment-eligibility/ports/professional-service-eligibility.port';
@Module({ imports:[TenantsModule,CustomersModule,ServicesModule,ProfessionalsModule,AppointmentsModule,LicensingModule], providers:[CheckAppointmentEligibility,CustomerRestrictionAdapter,D1LicenseEligibilityAdapter,D1PlanLimitAdapter,D1ProfessionalServiceEligibility,ClinicalAssessmentEligibilityAdapter,{provide:ASSESSMENT_ELIGIBILITY,useExisting:ClinicalAssessmentEligibilityAdapter},{provide:CUSTOMER_RESTRICTION,useExisting:CustomerRestrictionAdapter},{provide:LICENSE_ELIGIBILITY,useExisting:D1LicenseEligibilityAdapter},{provide:PLAN_LIMIT,useExisting:D1PlanLimitAdapter},{provide:PROFESSIONAL_SERVICE_ELIGIBILITY,useExisting:D1ProfessionalServiceEligibility}], exports:[CheckAppointmentEligibility] })
export class AppointmentEligibilityModule {}
