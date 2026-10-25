import { Module } from '@nestjs/common';
import { D1AssessmentRepository } from '@beauty/clinical/modules/assessments/infrastructure/d1-assessment-repository';
import { CheckAssessmentEligibility } from '@beauty/clinical/modules/assessments/application/check-assessment-eligibility';
import { ASSESSMENT_REPOSITORY } from '@beauty/clinical/modules/assessments/ports/assessment-repository';

@Module({providers:[D1AssessmentRepository,CheckAssessmentEligibility,{provide:ASSESSMENT_REPOSITORY,useExisting:D1AssessmentRepository}],exports:[CheckAssessmentEligibility]})
export class AssessmentsModule {}
