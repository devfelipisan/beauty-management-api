import { Inject, Injectable } from '@nestjs/common';
import { ASSESSMENT_REPOSITORY, type AssessmentRepository } from '../ports/assessment-repository.js';
import { AssessmentEligibilityPolicy } from '../domain/assessment-eligibility-policy.js';
@Injectable() export class CheckAssessmentEligibility { constructor(@Inject(ASSESSMENT_REPOSITORY) private readonly repo:AssessmentRepository){} async execute(input:{tenantId:string;customerId:string;serviceId:string;professionalId:string;requiresAssessment:boolean}){const a=input.requiresAssessment?await this.repo.findLatest(input.tenantId,input.customerId,input.serviceId,input.professionalId):null; return {eligible:new AssessmentEligibilityPolicy().evaluate(input.requiresAssessment,a?.data??null),result:a?.data.result};} }
