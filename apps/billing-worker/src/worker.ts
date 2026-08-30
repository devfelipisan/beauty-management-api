import { dispatchHealth, notFound } from '../../../libs/cloudflare-runtime/src/index.js';
export interface BillingEnv {}
export default { async fetch(request:Request,_env:BillingEnv,_ctx:unknown):Promise<Response> { return dispatchHealth(request,'beauty-billing-worker')??notFound(); } };
