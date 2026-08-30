/// <reference types="@cloudflare/workers-types" />
import { WorkerEntrypoint } from 'cloudflare:workers';
import { dispatchHealth, notFound } from '../../../libs/cloudflare-runtime/src/index.js';
import { CalculateCommercialTerms } from './commercial-terms/application/calculate-commercial-terms.js';
import { UnavailableDiscountPolicy } from './discounts/adapters/unavailable-discount-policy.js';
import { UnavailableDepositPolicy } from './deposits/adapters/unavailable-deposit-policy.js';
import type { CalculateCommercialTermsRequest, CommercialTermsResponse } from '../../../libs/contracts/src/index.js';
export interface BillingEnv {}
export default class BillingWorker extends WorkerEntrypoint<BillingEnv> { async fetch(request:Request):Promise<Response>{return dispatchHealth(request,'beauty-billing-worker')??notFound();} async calculateCommercialTerms(input:CalculateCommercialTermsRequest):Promise<CommercialTermsResponse>{if(!input.tenantId||!input.customerId||!input.serviceId||!Number.isInteger(input.basePriceCents)||input.basePriceCents<0)return {status:'BLOCKED',reason:'INVALID_COMMERCIAL_TERMS'}; return new CalculateCommercialTerms(new UnavailableDiscountPolicy(),new UnavailableDepositPolicy()).execute(input);} }
