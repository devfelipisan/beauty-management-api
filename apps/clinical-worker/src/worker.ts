/// <reference types="@cloudflare/workers-types" />
import { WorkerEntrypoint } from 'cloudflare:workers';
import { dispatchHealth, notFound } from '../../../libs/cloudflare-runtime/src/index.js';
import { D1AssessmentRepository } from './assessments/adapters/d1-assessment-repository.js';
import { CheckAssessmentEligibility } from './assessments/application/check-assessment-eligibility.js';
import type { AssessmentEligibilityRequest, AssessmentEligibilityResponse } from '../../../libs/contracts/src/index.js';
export interface ClinicalEnv { D1_DATABASE:D1Database; }
export default class ClinicalWorker extends WorkerEntrypoint<ClinicalEnv> { async fetch(request:any):Promise<any>{return dispatchHealth(request,'beauty-clinical-worker')??notFound();} async checkAssessmentEligibility(input:AssessmentEligibilityRequest):Promise<AssessmentEligibilityResponse>{if(!input.tenantId||!input.customerId||!input.serviceId||!input.professionalId) return {eligible:false}; const repository=new D1AssessmentRepository(this.env.D1_DATABASE); return new CheckAssessmentEligibility(repository).execute({...input,requiresAssessment:true});} }
