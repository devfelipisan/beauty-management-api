import { dispatchHealth, notFound } from '../../../libs/cloudflare-runtime/src/index.js';
export interface OperationsEnv { D1_DATABASE:unknown; CLINICAL_SERVICE:unknown; BILLING_SERVICE:unknown; }
export default { async fetch(request:Request,_env:OperationsEnv,_ctx:unknown):Promise<Response> { return dispatchHealth(request,'beauty-operations-worker')??notFound(); } };
