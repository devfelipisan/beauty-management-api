import { dispatchHealth, json, notFound } from '../../../libs/cloudflare-runtime/src/index.js';
export interface ClinicalEnv { D1_DATABASE:unknown; }
export default { async fetch(request:Request,_env:ClinicalEnv,_ctx:unknown):Promise<Response> { return dispatchHealth(request,'beauty-clinical-worker')??notFound(); }, async checkAssessmentEligibility(_input:unknown){ return json({eligible:false},503); } };
