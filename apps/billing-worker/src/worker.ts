import { serveSwagger } from '@beauty/cloudflare-runtime/swagger';
import { billingOpenApi } from './openapi.js';
import { BillingComposition } from './composition-root.js';
import type { BillingEnv } from './env.js';
/// <reference types="@cloudflare/workers-types" />
import { WorkerEntrypoint } from 'cloudflare:workers';
import { dispatchHealth, notFound, json, ids, mappedError } from '@beauty/cloudflare-runtime';
import { MockIdentityProvider } from '@beauty/authentication/adapters/mock-identity-provider';import { MockTenantMembershipProvider } from '@beauty/tenancy/adapters/mock-tenant-membership-provider';

export type { BillingEnv } from './env.js';
export default class BillingWorker extends WorkerEntrypoint<BillingEnv> {
  async fetch(request:Request):Promise<Response>{const docs=serveSwagger(request,billingOpenApi);if(docs)return docs;const health=dispatchHealth(request,'beauty-billing-worker');if(health)return health;const match=new URL(request.url).pathname.match(/^\/tenants\/([^/]+)\/receivables\/([^/]+)\/payments$/);if(!match)return notFound();const {requestId,correlationId}=ids(request);try{if(request.method!=='POST')return notFound();const token=request.headers.get('authorization')?.match(/^Bearer\s+([^\s]+)$/i)?.[1];const identity=token?await new MockIdentityProvider().authenticate(token):null;if(!identity)return json({status:'error',code:token?'INVALID_AUTHENTICATION':'AUTHENTICATION_REQUIRED',requestId,correlationId},401);const membership=await new MockTenantMembershipProvider().findActiveMembership(identity.actorId,match[1]);if(!membership)return json({status:'error',code:'TENANT_ACCESS_DENIED',requestId,correlationId},403);if(!membership.permissions.includes('payment.create'))return json({status:'error',code:'PERMISSION_DENIED',requestId,correlationId},403);const key=request.headers.get('Idempotency-Key');if(!key?.trim())return json({status:'error',code:'IDEMPOTENCY_KEY_REQUIRED',requestId,correlationId},400);const body=await request.json() as Record<string,unknown>;return json({data:await this.registerPayment({tenantId:match[1],receivableId:match[2],customerId:typeof body.customerId==='string'?body.customerId:undefined,amountCents:body.amountCents as number,method:body.method as never,externalReference:body.externalReference as string|undefined,notes:body.notes as string|undefined,actorId:identity.actorId,idempotencyKey:key,requestId,correlationId}),requestId,correlationId},201);}catch(error){return mappedError(error,requestId,correlationId);}}
  calculateCommercialTerms(...args: Parameters<BillingComposition['calculateCommercialTerms']>) { return new BillingComposition(this.env).calculateCommercialTerms(...args); }
  createDepositForAppointment(...args: Parameters<BillingComposition['createDepositForAppointment']>) { return new BillingComposition(this.env).createDepositForAppointment(...args); }
  confirmDeposit(...args: Parameters<BillingComposition['confirmDeposit']>) { return new BillingComposition(this.env).confirmDeposit(...args); }
  expireDeposit(...args: Parameters<BillingComposition['expireDeposit']>) { return new BillingComposition(this.env).expireDeposit(...args); }
  dispatchOutboxBatch(...args: Parameters<BillingComposition['dispatchOutboxBatch']>) { return new BillingComposition(this.env).dispatchOutboxBatch(...args); }
  applyPackageConsumptionRequested(...args: Parameters<BillingComposition['applyPackageConsumptionRequested']>) { return new BillingComposition(this.env).applyPackageConsumptionRequested(...args); }
  materializeCustomerPackage(...args: Parameters<BillingComposition['materializeCustomerPackage']>) { return new BillingComposition(this.env).materializeCustomerPackage(...args); }
  checkPackageUsageEligibility(...args: Parameters<BillingComposition['checkPackageUsageEligibility']>) { return new BillingComposition(this.env).checkPackageUsageEligibility(...args); }
  applyFinancialSettlementRequested(...args: Parameters<BillingComposition['applyFinancialSettlementRequested']>) { return new BillingComposition(this.env).applyFinancialSettlementRequested(...args); }
  registerPayment(...args: Parameters<BillingComposition['registerPayment']>) { return new BillingComposition(this.env).registerPayment(...args); }
  issueRefund(...args: Parameters<BillingComposition['issueRefund']>) { return new BillingComposition(this.env).issueRefund(...args); }
  grantInternalCredit(...args: Parameters<BillingComposition['grantInternalCredit']>) { return new BillingComposition(this.env).grantInternalCredit(...args); }
  evaluateAppointmentCancellationFinancials(...args: Parameters<BillingComposition['evaluateAppointmentCancellationFinancials']>) { return new BillingComposition(this.env).evaluateAppointmentCancellationFinancials(...args); }
  evaluateAppointmentNoShowFinancials(...args: Parameters<BillingComposition['evaluateAppointmentNoShowFinancials']>) { return new BillingComposition(this.env).evaluateAppointmentNoShowFinancials(...args); }
  validateFinancialDecisionSnapshot(...args: Parameters<BillingComposition['validateFinancialDecisionSnapshot']>) { return new BillingComposition(this.env).validateFinancialDecisionSnapshot(...args); }
  buildFinancialDecisionSnapshot(...args: Parameters<BillingComposition['buildFinancialDecisionSnapshot']>) { return new BillingComposition(this.env).buildFinancialDecisionSnapshot(...args); }
  applyAppointmentCanceledFinancialEffects(...args: Parameters<BillingComposition['applyAppointmentCanceledFinancialEffects']>) { return new BillingComposition(this.env).applyAppointmentCanceledFinancialEffects(...args); }
  applyAppointmentNoShowFinancialEffects(...args: Parameters<BillingComposition['applyAppointmentNoShowFinancialEffects']>) { return new BillingComposition(this.env).applyAppointmentNoShowFinancialEffects(...args); }
}
