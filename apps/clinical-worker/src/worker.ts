/// <reference types="@cloudflare/workers-types" />
import { WorkerEntrypoint } from 'cloudflare:workers';
import { dispatchHealth, ids, json, mappedError, notFound } from '../../../libs/cloudflare-runtime/src/index.js';
import { MockIdentityProvider } from '../../../libs/authentication/src/adapters/mock-identity-provider.js';
import { MockTenantMembershipProvider } from '../../../libs/tenancy/src/adapters/mock-tenant-membership-provider.js';
import type { AssessmentEligibilityRequest, AssessmentEligibilityResponse, GetSessionStartContextRequest, SessionResponse, StartSessionRequest } from '../../../libs/contracts/src/index.js';
import { D1AssessmentRepository } from './assessments/adapters/d1-assessment-repository.js';
import { CheckAssessmentEligibility } from './assessments/application/check-assessment-eligibility.js';
import { D1SessionRepository } from './sessions/adapters/d1-session-repository.js';
import { StartSession } from './sessions/application/start-session.js';
import { D1IdempotencyStore } from '../../../libs/reliability/src/d1/d1-reliability-store.js';
import { D1UnitOfWork } from '../../../libs/reliability/src/d1/d1-unit-of-work.js';
import type { SessionStartContextPort } from './sessions/ports/session-start-context.port.js';
import { D1OutboxDeliveryRepository } from '../../../libs/reliability/src/d1/d1-outbox-delivery-repository.js';
import { DispatchOutboxBatch } from '../../../libs/reliability/src/outbox/dispatch-outbox-batch.js';
import { OperationsSessionDelivery } from './sessions/adapters/operations-session-delivery.js';
export interface ClinicalEnv { D1_DATABASE:D1Database; OPERATIONS_SERVICE:unknown; }
export default class ClinicalWorker extends WorkerEntrypoint<ClinicalEnv> {
  async fetch(request:any):Promise<any>{const health=dispatchHealth(request,'beauty-clinical-worker');if(health)return health;const match=new URL(request.url).pathname.match(/^\/tenants\/([^/]+)\/appointments\/([^/]+)\/session\/start$/);if(!match)return notFound();const {requestId,correlationId}=ids(request);try{const token=request.headers.get('authorization')?.match(/^Bearer\s+([^\s]+)$/i)?.[1];const identity=token?await new MockIdentityProvider().authenticate(token):null;if(!identity)return json({status:'error',code:token?'INVALID_AUTHENTICATION':'AUTHENTICATION_REQUIRED',requestId,correlationId},401);const membership=await new MockTenantMembershipProvider().findActiveMembership(identity.actorId,match[1]);if(!membership)return json({status:'error',code:'TENANT_ACCESS_DENIED',requestId,correlationId},403);if(!membership.permissions.includes('session.start'))return json({status:'error',code:'PERMISSION_DENIED',requestId,correlationId},403);const key=request.headers.get('Idempotency-Key');if(!key?.trim())return json({status:'error',code:'IDEMPOTENCY_KEY_REQUIRED',requestId,correlationId},400);const body=await request.text();if(body&&body!=='{}')return json({status:'error',code:'VALIDATION_ERROR',requestId,correlationId},400);const result=await this.startSession({tenantId:match[1],appointmentId:match[2],actorId:identity.actorId,idempotencyKey:key,requestId,correlationId});return json({data:result,requestId,correlationId},201);}catch(error){return mappedError(error,requestId,correlationId);}}
  async checkAssessmentEligibility(input:AssessmentEligibilityRequest):Promise<AssessmentEligibilityResponse>{if(!input.tenantId||!input.customerId||!input.serviceId||!input.professionalId)return {eligible:false};const repository=new D1AssessmentRepository(this.env.D1_DATABASE);return new CheckAssessmentEligibility(repository).execute({...input,requiresAssessment:true});}
  async startSession(input:StartSessionRequest):Promise<SessionResponse>{const operations=this.env.OPERATIONS_SERVICE as SessionStartContextPort;return new StartSession(new D1SessionRepository(this.env.D1_DATABASE),operations,new D1UnitOfWork(this.env.D1_DATABASE),new D1IdempotencyStore(this.env.D1_DATABASE)).execute(input);}
  async getSessionStartContext(input:GetSessionStartContextRequest){return (this.env.OPERATIONS_SERVICE as SessionStartContextPort).getSessionStartContext(input);}
  async dispatchOutboxBatch(input:{workerId:string;batchSize:number;leaseSeconds:number;now?:string}){return new DispatchOutboxBatch(new D1OutboxDeliveryRepository(this.env.D1_DATABASE,['SessionStarted']),new OperationsSessionDelivery(this.env.OPERATIONS_SERVICE as never)).execute(input);}
}
