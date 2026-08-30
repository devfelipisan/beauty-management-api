import { Module } from '@nestjs/common';
import { D1AssessmentRepository } from './adapters/d1-assessment-repository.js';
import { CheckAssessmentEligibility } from './application/check-assessment-eligibility.js';
import { ASSESSMENT_REPOSITORY } from './ports/assessment-repository.js';

@Module({providers:[D1AssessmentRepository,CheckAssessmentEligibility,{provide:ASSESSMENT_REPOSITORY,useExisting:D1AssessmentRepository}],exports:[CheckAssessmentEligibility]})
export class AssessmentsModule {}
