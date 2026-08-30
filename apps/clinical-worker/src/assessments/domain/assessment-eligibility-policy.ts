import type { AssessmentResult } from '@beauty/contracts';
export class AssessmentEligibilityPolicy { evaluate(required:boolean, assessment:{result:AssessmentResult;validUntil?:string}|null, now=new Date()):boolean { if(!required)return true; if(!assessment||assessment.result==='NAO_APTO')return false; return !assessment.validUntil || now.getTime()<=Date.parse(assessment.validUntil); } }
